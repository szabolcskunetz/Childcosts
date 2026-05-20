// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.
import { App } from "../index.js";
import { expenses, participants } from "../db/schema.js";
import { eq, and, gte, lte, like, or, inArray } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { requireAnyAuth } from "../utils/mobile-auth.js";

export function registerExpensesRoutes(app: App) {
  // GET /api/expenses?projectId=... - Returns expenses for a project
  app.fastify.get<{
    Querystring: {
      search?: string;
      minAmount?: string;
      maxAmount?: string;
      projectId?: string;
    };
  }>("/api/expenses", async (request, reply) => {
    const { search, minAmount, maxAmount, projectId } = request.query;
    app.logger.info(
      { search, minAmount, maxAmount, projectId },
      "Fetching expenses",
    );

    try {
      if (!projectId) {
        reply.code(400);
        return { error: "projectId is required" };
      }

      const conditions = [eq(expenses.projectId, projectId)];

      if (search) {
        conditions.push(like(expenses.description, `%${search}%`));
      }
      if (minAmount) {
        conditions.push(gte(expenses.amount, minAmount));
      }
      if (maxAmount) {
        conditions.push(lte(expenses.amount, maxAmount));
      }

      const filteredExpenses = await app.db
        .select()
        .from(expenses)
        .where(and(...conditions));

      // Fetch participant details for paidBy (which is a participant UUID)
      // createdBy is a user ID string and should NOT be looked up in participants
      const enrichedExpenses = await Promise.all(
        filteredExpenses.map(async (expense) => {
          const paidByParticipant = await app.db
            .select()
            .from(participants)
            .where(eq(participants.id, expense.paidBy));

          return {
            id: expense.id,
            date: expense.date,
            description: expense.description,
            amount: parseFloat(expense.amount as string),
            paidBy: paidByParticipant[0]
              ? {
                  id: paidByParticipant[0].id,
                  name: paidByParticipant[0].name,
                  color: paidByParticipant[0].color || "#3B82F6",
                }
              : null,
            splitPercentage: parseFloat(expense.splitPercentage as string),
            createdBy: expense.createdBy, // Return as-is (user ID string)
            createdAt: expense.createdAt,
          };
        }),
      );

      app.logger.info(
        { count: enrichedExpenses.length },
        "Expenses fetched successfully",
      );
      return enrichedExpenses;
    } catch (error) {
      app.logger.error(
        { err: error, search, minAmount, maxAmount },
        "Failed to fetch expenses",
      );
      throw error;
    }
  });

  // POST /api/expenses - Creates expense (requires projectId)
  app.fastify.post<{
    Body: {
      date: string;
      description: string;
      amount: number;
      paidBy: string;
      splitPercentage?: number;
      createdBy?: string | null;
      projectId: string;
    };
  }>("/api/expenses", async (request, reply) => {
    app.logger.info({ body: request.body }, "Creating new expense");

    try {
      let {
        date,
        description,
        amount,
        paidBy,
        splitPercentage = 50.0,
        createdBy,
        projectId,
      } = request.body;

      if (!projectId) {
        reply.code(400);
        return { error: "projectId is required" };
      }

      const createdByValue =
        createdBy === undefined || createdBy === "" ? null : createdBy;

      const newExpense = await app.db
        .insert(expenses)
        .values({
          date: new Date(date),
          description,
          amount: amount.toString(),
          paidBy,
          splitPercentage: splitPercentage.toString(),
          createdBy: createdByValue,
          projectId,
        })
        .returning();

      // Fetch participant details for paidBy (which is a participant UUID)
      // createdBy is a user ID string and should NOT be looked up in participants
      const paidByParticipant = await app.db
        .select()
        .from(participants)
        .where(eq(participants.id, paidBy));

      const result = {
        id: newExpense[0].id,
        date: newExpense[0].date,
        description: newExpense[0].description,
        amount: parseFloat(newExpense[0].amount as string),
        paidBy: paidByParticipant[0]
          ? {
              id: paidByParticipant[0].id,
              name: paidByParticipant[0].name,
              color: paidByParticipant[0].color || "#3B82F6",
            }
          : null,
        splitPercentage: parseFloat(newExpense[0].splitPercentage as string),
        createdBy: newExpense[0].createdBy, // Return as-is (user ID string)
        createdAt: newExpense[0].createdAt,
      };

      app.logger.info(
        { expenseId: newExpense[0].id, createdBy },
        "Expense created successfully",
      );
      return result;
    } catch (error) {
      app.logger.error(
        { err: error, body: request.body },
        "Failed to create expense",
      );
      throw error;
    }
  });

  // PUT /api/expenses/:id - Updates expense
  app.fastify.put<{
    Params: { id: string };
    Body: {
      date?: string;
      description?: string;
      amount?: number;
      paidBy?: string;
      splitPercentage?: number;
    };
  }>("/api/expenses/:id", async (request, reply) => {
    const { id } = request.params;
    app.logger.info({ expenseId: id, body: request.body }, "Updating expense");

    try {
      // Require authentication
      const session = await requireAnyAuth(app, request, reply);
      if (!session) {
        app.logger.warn(
          { expenseId: id },
          "Unauthenticated attempt to update expense",
        );
        return;
      }

      // Check if expense exists and createdBy matches
      const expense = await app.db
        .select()
        .from(expenses)
        .where(eq(expenses.id, id));

      if (expense.length === 0) {
        reply.code(404);
        return { error: "Expense not found" };
      }

      // Allow updates if:
      // 1. createdBy is null (anonymous/legacy data - anyone can edit), OR
      // 2. createdBy matches the authenticated user ID
      if (
        expense[0].createdBy !== null &&
        expense[0].createdBy !== session.user.id
      ) {
        app.logger.warn(
          {
            expenseId: id,
            userId: session.user.id,
            createdBy: expense[0].createdBy,
          },
          "User attempted to update expense they do not own",
        );
        reply.code(403);
        return { error: "Only the creator can modify this expense" };
      }

      const { date, description, amount, paidBy, splitPercentage } =
        request.body;

      const updateData: any = {};
      if (date) updateData.date = new Date(date);
      if (description) updateData.description = description;
      if (amount) updateData.amount = amount.toString();
      if (paidBy) updateData.paidBy = paidBy;
      if (splitPercentage)
        updateData.splitPercentage = splitPercentage.toString();

      const updatedExpense = await app.db
        .update(expenses)
        .set(updateData)
        .where(eq(expenses.id, id))
        .returning();

      // Fetch participant details for paidBy (which is a participant UUID)
      // createdBy is a user ID string and should NOT be looked up in participants
      const paidByParticipant = await app.db
        .select()
        .from(participants)
        .where(eq(participants.id, updatedExpense[0].paidBy));

      const result = {
        id: updatedExpense[0].id,
        date: updatedExpense[0].date,
        description: updatedExpense[0].description,
        amount: parseFloat(updatedExpense[0].amount as string),
        paidBy: paidByParticipant[0]
          ? {
              id: paidByParticipant[0].id,
              name: paidByParticipant[0].name,
              color: paidByParticipant[0].color || "#3B82F6",
            }
          : null,
        splitPercentage: parseFloat(
          updatedExpense[0].splitPercentage as string,
        ),
        createdBy: updatedExpense[0].createdBy, // Return as-is (user ID string)
        createdAt: updatedExpense[0].createdAt,
      };

      app.logger.info({ expenseId: id }, "Expense updated successfully");
      return result;
    } catch (error) {
      app.logger.error(
        { err: error, expenseId: id, body: request.body },
        "Failed to update expense",
      );
      throw error;
    }
  });

  // DELETE /api/expenses/:id - Deletes expense
  app.fastify.delete<{
    Params: { id: string };
  }>("/api/expenses/:id", async (request, reply) => {
    const { id } = request.params;
    app.logger.info({ expenseId: id }, "Deleting expense");

    try {
      // Require authentication
      const session = await requireAnyAuth(app, request, reply);
      if (!session) {
        app.logger.warn(
          { expenseId: id },
          "Unauthenticated attempt to delete expense",
        );
        return;
      }

      // Check if expense exists
      const expense = await app.db
        .select()
        .from(expenses)
        .where(eq(expenses.id, id));

      if (expense.length === 0) {
        reply.code(404);
        return { error: "Expense not found" };
      }

      // Allow deletion if:
      // 1. createdBy is null (anonymous/legacy data - anyone can delete), OR
      // 2. createdBy matches the authenticated user ID
      if (
        expense[0].createdBy !== null &&
        expense[0].createdBy !== session.user.id
      ) {
        app.logger.warn(
          {
            expenseId: id,
            userId: session.user.id,
            createdBy: expense[0].createdBy,
          },
          "User attempted to delete expense they do not own",
        );
        reply.code(403);
        return { error: "Only the creator can delete this expense" };
      }

      await app.db.delete(expenses).where(eq(expenses.id, id));

      app.logger.info(
        { expenseId: id, userId: session.user.id },
        "Expense deleted successfully",
      );
      return { success: true };
    } catch (error) {
      app.logger.error(
        { err: error, expenseId: id },
        "Failed to delete expense",
      );
      throw error;
    }
  });

  // GET /api/expenses/export?projectId=... - Exports expenses as CSV or XLSX
  app.fastify.get<{
    Querystring: { ids?: string; format?: string; projectId?: string };
  }>("/api/expenses/export", async (request, reply) => {
    const { ids, format = "csv", projectId } = request.query;
    app.logger.info({ ids, format, projectId }, "Exporting expenses");

    try {
      if (!projectId) {
        reply.code(400);
        return { error: "projectId is required" };
      }

      let allExpenses;
      if (ids) {
        const expenseIds = ids.split(",");
        allExpenses = await app.db
          .select()
          .from(expenses)
          .where(
            and(
              eq(expenses.projectId, projectId),
              inArray(expenses.id, expenseIds),
            ),
          );
      } else {
        allExpenses = await app.db
          .select()
          .from(expenses)
          .where(eq(expenses.projectId, projectId));
      }

      const allParticipants = await app.db
        .select()
        .from(participants)
        .where(eq(participants.projectId, projectId));
      const participantMap = new Map(
        allParticipants.map((p) => [p.id, p.name]),
      );

      // Build data rows
      const headers = [
        "Date",
        "Description",
        ...allParticipants.map((p) => `Paid by ${p.name}`),
      ];
      const rows = [headers];

      for (const expense of allExpenses) {
        const row = [
          new Date(expense.date as any).toISOString(),
          expense.description,
          ...allParticipants.map((p) =>
            p.id === expense.paidBy ? expense.amount : "0",
          ),
        ];
        rows.push(row);
      }

      if (format === "xlsx") {
        // Export as Excel
        const worksheet = XLSX.utils.aoa_to_sheet(rows);

        // Set column widths
        const columnWidths = [25, 30, ...allParticipants.map(() => 18)];
        worksheet["!cols"] = columnWidths.map((width) => ({ wch: width }));

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Expenses");

        // Generate Excel file as buffer
        const excelBuffer = XLSX.write(workbook, {
          bookType: "xlsx",
          type: "buffer",
        });

        reply.header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        reply.header(
          "Content-Disposition",
          'attachment; filename="expenses.xlsx"',
        );
        app.logger.info(
          { expenseCount: allExpenses.length, format },
          "Expenses exported successfully",
        );
        return excelBuffer;
      } else {
        // Export as CSV (default)
        const csv = rows
          .map((row) => row.map((cell) => `"${cell}"`).join(","))
          .join("\n");

        reply.header("Content-Type", "text/csv");
        reply.header(
          "Content-Disposition",
          'attachment; filename="expenses.csv"',
        );
        app.logger.info(
          { expenseCount: allExpenses.length, format },
          "Expenses exported successfully",
        );
        return csv;
      }
    } catch (error) {
      app.logger.error(
        { err: error, ids, format },
        "Failed to export expenses",
      );
      throw error;
    }
  });

  // POST /api/expenses/import?projectId=... - Imports expenses from CSV or Excel
  app.fastify.post<{ Querystring: { projectId?: string } }>(
    "/api/expenses/import",
    async (request, reply) => {
      const { projectId } = request.query;
      app.logger.info({ projectId }, "Importing expenses from file");
      if (!projectId) {
        reply.code(400);
        return { error: "projectId is required", imported: 0, errors: [] };
      }

      try {
        let data;
        try {
          data = await request.file();
        } catch (fileError) {
          app.logger.warn(
            { err: fileError },
            "Error retrieving file from request",
          );
          data = null;
        }

        if (!data) {
          app.logger.warn({}, "No file provided in import request");
          reply.code(400);
          return { error: "No file provided", imported: 0, errors: [] };
        }

        // Get file extension to detect format
        const filename = data.filename.toLowerCase();
        app.logger.info(
          { filename, encoding: data.encoding, mimetype: data.mimetype },
          "Processing file upload",
        );
        const isExcel = filename.endsWith(".xlsx") || filename.endsWith(".xls");
        const isCSV = filename.endsWith(".csv");

        if (!isExcel && !isCSV) {
          app.logger.warn({ filename }, "Invalid file format");
          reply.code(400);
          return {
            error:
              "Invalid file format. Please upload a CSV or Excel file (.csv, .xlsx, .xls)",
            imported: 0,
            errors: [],
          };
        }

        let buffer: Buffer;
        try {
          buffer = await data.toBuffer();
        } catch (bufferError) {
          app.logger.error({ err: bufferError }, "Failed to read file buffer");
          reply.code(400);
          return { error: "Failed to read file", imported: 0, errors: [] };
        }

        app.logger.info(
          { filesize: buffer.length, format: isExcel ? "xlsx" : "csv" },
          "File buffer ready",
        );
        const allParticipants = await app.db
          .select()
          .from(participants)
          .where(eq(participants.projectId, projectId));
        const participantMap = new Map(
          allParticipants.map((p) => [p.name, p.id]),
        );

        let records: Array<Record<string, any>> = [];
        let headers: string[] = [];

        try {
          if (isExcel) {
            // Parse Excel file
            try {
              const workbook = XLSX.read(buffer, { type: "buffer" });
              app.logger.info(
                { sheets: workbook.SheetNames },
                "Excel workbook loaded",
              );

              const worksheet = workbook.Sheets[workbook.SheetNames[0]];
              if (!worksheet) {
                reply.code(400);
                return {
                  error: "Excel file has no sheets",
                  imported: 0,
                  errors: [],
                };
              }

              const data = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
              }) as any[][];

              if (data.length === 0) {
                reply.code(400);
                return {
                  error: "Excel file is empty",
                  imported: 0,
                  errors: [],
                };
              }

              headers = data[0] || [];
              app.logger.info(
                { headerCount: headers.length, rowCount: data.length - 1 },
                "Excel file parsed",
              );

              for (let i = 1; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length === 0) continue; // Skip empty rows

                const record: Record<string, any> = {};
                for (let j = 0; j < headers.length; j++) {
                  record[headers[j]] = row[j];
                }
                records.push(record);
              }
            } catch (excelError) {
              app.logger.error(
                { err: excelError },
                "Failed to parse Excel file",
              );
              reply.code(400);
              return {
                error: `Failed to parse Excel file: ${excelError instanceof Error ? excelError.message : "Unknown error"}`,
                imported: 0,
                errors: [],
              };
            }
          } else {
            // Parse CSV file
            try {
              const csvContent = buffer.toString("utf-8");
              records = parse(csvContent, {
                columns: true,
                skip_empty_lines: true,
              }) as Array<Record<string, string>>;
              headers = Object.keys(records[0] || {});
              app.logger.info(
                { headerCount: headers.length, rowCount: records.length },
                "CSV file parsed",
              );
            } catch (csvError) {
              app.logger.error({ err: csvError }, "Failed to parse CSV file");
              reply.code(400);
              return {
                error: `Failed to parse CSV file: ${csvError instanceof Error ? csvError.message : "Unknown error"}`,
                imported: 0,
                errors: [],
              };
            }
          }
        } catch (parseError) {
          app.logger.error(
            { err: parseError },
            "Unexpected error during file parsing",
          );
          throw parseError;
        }

        const imported: string[] = [];
        const errors: string[] = [];

        // Get first participant as createdBy (fallback if no specific creator)
        const firstParticipant = allParticipants[0];
        if (!firstParticipant) {
          reply.code(400);
          return {
            error: "No participants available",
            imported: 0,
            errors: [],
          };
        }
        const createdById = firstParticipant.id;

        // Helper function to find column by various possible names (multilingual support)
        const findColumn = (
          record: Record<string, any>,
          possibleNames: string[],
        ): [string | null, any] => {
          for (const header of headers) {
            if (!header) continue;
            const headerLower = String(header).toLowerCase().trim();

            for (const possibleName of possibleNames) {
              if (headerLower === possibleName.toLowerCase()) {
                return [header, record[header]];
              }
            }
          }
          return [null, undefined];
        };

        // Helper function to find participant columns with multilingual support
        const findParticipantColumns = (): Map<
          string,
          { headerName: string; pattern: string }
        > => {
          const participantColumns = new Map<
            string,
            { headerName: string; pattern: string }
          >();

          for (const header of headers) {
            if (!header) continue;
            const headerLower = String(header).toLowerCase().trim();

            // Skip known non-participant columns
            if (
              headerLower === "date" ||
              headerLower === "timestamp" ||
              headerLower === "datum" ||
              headerLower === "zeitpunkt" ||
              headerLower === "fecha" ||
              headerLower === "időpont" ||
              headerLower === "idopont" ||
              headerLower === "description" ||
              headerLower === "cost" ||
              headerLower === "expense" ||
              headerLower === "beschreibung" ||
              headerLower === "kosten" ||
              headerLower === "descripción" ||
              headerLower === "descripcion" ||
              headerLower === "costo" ||
              headerLower === "leírás" ||
              headerLower === "leiras" ||
              headerLower === "költség" ||
              headerLower === "koltseg" ||
              headerLower === "költség megnevezése" ||
              headerLower === "koltseg megnevezese"
            ) {
              continue;
            }

            // Multilingual patterns for participant columns
            // English: "Paid by [Name]", "[Name] paid"
            // German: "[Name] bezahlt", "Bezahlt von [Name]"
            // Spanish: "[Name] pagó", "[Name] pago", "Pagado por [Name]"
            // Hungarian: "[Name] fizette", "Fizette: [Name]"
            const patterns = [
              /^paid\s+by\s+(.+)$/i, // English: "Paid by Name"
              /^(.+)\s+paid$/i, // English: "Name paid"
              /^(.+)\s+bezahlt$/i, // German: "Name bezahlt"
              /^bezahlt\s+von\s+(.+)$/i, // German: "Bezahlt von Name"
              /^(.+)\s+pag[oó]$/i, // Spanish: "Name pagó" or "Name pago"
              /^pagado\s+por\s+(.+)$/i, // Spanish: "Pagado por Name"
              /^(.+)\s+fizette$/i, // Hungarian: "Name fizette"
              /^fizette:?\s+(.+)$/i, // Hungarian: "Fizette: Name"
            ];

            for (const pattern of patterns) {
              const match = String(header).match(pattern);
              if (match) {
                const participantName = match[1].trim();
                participantColumns.set(header, {
                  headerName: header,
                  pattern: pattern.source,
                });
                break;
              }
            }
          }

          return participantColumns;
        };

        // Helper function to parse dates flexibly
        const parseDate = (
          dateValue: any,
        ): { date: Date | null; originalValue: string } => {
          if (!dateValue) return { date: null, originalValue: "" };

          const strValue = String(dateValue).trim();

          // Try ISO 8601 format first
          const isoDate = new Date(strValue);
          if (!isNaN(isoDate.getTime())) {
            // Check if it's a valid date string (not just a number parsed as date)
            if (!/^\d+$/.test(strValue.replace(/[-T:.Z]/g, ""))) {
              return { date: isoDate, originalValue: strValue };
            }
          }

          // Try Excel serial date (numeric value)
          const numValue = parseFloat(strValue);
          if (!isNaN(numValue) && numValue > 0 && numValue < 100000) {
            // Excel stores dates as serial numbers: days since December 30, 1899
            // (Note: December 31, 1899 = serial 0, January 1, 1900 = serial 1)
            // This accounts for Excel's 1900 leap year bug
            const excelEpoch = new Date(1899, 11, 30); // December 30, 1899 in UTC
            const excelEpochTime = excelEpoch.getTime();

            // Convert serial number to milliseconds (24 hours = 86,400,000 ms)
            const excelDate = new Date(
              excelEpochTime + numValue * 24 * 60 * 60 * 1000,
            );

            // Validate the date is in a reasonable range (1900-2100)
            if (
              !isNaN(excelDate.getTime()) &&
              excelDate.getFullYear() >= 1900 &&
              excelDate.getFullYear() <= 2100
            ) {
              app.logger.debug(
                { serial: numValue, parsed: excelDate.toISOString() },
                "Excel serial date parsed",
              );
              return { date: excelDate, originalValue: strValue };
            }
          }

          // Try common date formats
          const datePatterns = [
            {
              regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
              parse: (m: string[]) =>
                new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2])),
            }, // MM/DD/YYYY
            {
              regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
              parse: (m: string[]) =>
                new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])),
            }, // DD.MM.YYYY
            {
              regex: /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/,
              parse: (m: string[]) =>
                new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])),
            }, // YYYY.MM.DD
            {
              regex: /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
              parse: (m: string[]) =>
                new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])),
            }, // YYYY-MM-DD
          ];

          for (const pattern of datePatterns) {
            const match = strValue.match(pattern.regex);
            if (match) {
              const parsed = pattern.parse(match);
              if (
                !isNaN(parsed.getTime()) &&
                parsed.getFullYear() >= 1900 &&
                parsed.getFullYear() <= 2100
              ) {
                return { date: parsed, originalValue: strValue };
              }
            }
          }

          return { date: null, originalValue: strValue };
        };

        for (let i = 0; i < records.length; i++) {
          try {
            const record = records[i];

            // Check if record is completely empty
            const allEmpty = Object.values(record).every(
              (v) => !v || String(v).trim() === "",
            );
            if (allEmpty) {
              continue; // Silently skip completely empty rows
            }

            // Find Date column (multilingual support)
            const [dateHeader, dateValue] = findColumn(record, [
              // English
              "Date",
              "Timestamp",
              // German
              "Datum",
              "Zeitpunkt",
              // Spanish
              "Fecha",
              // Hungarian
              "Időpont",
              "Idopont",
            ]);
            if (!dateHeader) {
              errors.push(
                `Row ${i + 2}: Date column not found. Available columns: ${headers.join(", ")}`,
              );
              continue;
            }

            // Find Description/Cost column (multilingual support)
            const [descHeader, descValue] = findColumn(record, [
              // English
              "Description",
              "Cost",
              "Expense",
              // German
              "Beschreibung",
              "Kosten",
              // Spanish
              "Descripción",
              "Descripcion",
              "Costo",
              // Hungarian
              "Leírás",
              "Leiras",
              "Költség",
              "Koltseg",
              "Költség megnevezése",
              "Koltseg megnevezese",
            ]);
            if (!descHeader) {
              errors.push(
                `Row ${i + 2}: Description column not found. Available columns: ${headers.join(", ")}`,
              );
              continue;
            }

            // Trim and validate description
            const description = String(descValue).trim();
            if (!description) {
              errors.push(`Row ${i + 2}: Description is empty`);
              continue;
            }

            // Parse date
            const { date, originalValue: dateOriginal } = parseDate(dateValue);
            if (!date) {
              errors.push(
                `Row ${i + 2}: Invalid date '${dateOriginal}' in '${dateHeader}' column. Try ISO 8601 (2024-01-15), Excel date, or common formats (01/15/2024, 15.01.2024, 2024.01.15)`,
              );
              continue;
            }

            // Find all participants with non-zero amounts in this row
            const participantsWithAmounts: Array<{
              participantId: string;
              participantName: string;
              amount: number;
            }> = [];
            const participantErrors: string[] = [];

            // Get all participant columns with multilingual support
            const participantCols = findParticipantColumns();

            for (const [header, colInfo] of participantCols) {
              if (!header) continue;

              // Extract participant name from the column header using multilingual patterns
              const patterns = [
                /^paid\s+by\s+(.+)$/i, // English: "Paid by Name"
                /^(.+)\s+paid$/i, // English: "Name paid"
                /^(.+)\s+bezahlt$/i, // German: "Name bezahlt"
                /^bezahlt\s+von\s+(.+)$/i, // German: "Bezahlt von Name"
                /^(.+)\s+pag[oó]$/i, // Spanish: "Name pagó" or "Name pago"
                /^pagado\s+por\s+(.+)$/i, // Spanish: "Pagado por Name"
                /^(.+)\s+fizette$/i, // Hungarian: "Name fizette"
                /^fizette:?\s+(.+)$/i, // Hungarian: "Fizette: Name"
              ];

              let participantName: string | null = null;

              for (const pattern of patterns) {
                const match = String(header).match(pattern);
                if (match) {
                  participantName = match[1].trim();
                  break;
                }
              }

              if (!participantName) continue;

              const amountStr = record[header];
              const amount = amountStr ? parseFloat(String(amountStr)) : 0;

              if (!isNaN(amount) && amount > 0) {
                const participantId = participantMap.get(participantName);
                if (!participantId) {
                  participantErrors.push(
                    `Row ${i + 2}: Participant "${participantName}" not found in database. Available participants: ${Array.from(participantMap.keys()).join(", ")}`,
                  );
                  continue;
                }

                participantsWithAmounts.push({
                  participantId,
                  participantName,
                  amount,
                });
              }
            }

            if (participantErrors.length > 0) {
              errors.push(...participantErrors);
              continue;
            }

            if (participantsWithAmounts.length === 0) {
              errors.push(
                `Row ${i + 2}: No participant with non-zero amount found. Please check the 'Paid by [Name]' columns.`,
              );
              continue;
            }

            // Create a separate expense for each participant who paid
            for (const {
              participantId,
              participantName,
              amount,
            } of participantsWithAmounts) {
              try {
                const expense = await app.db
                  .insert(expenses)
                  .values({
                    date,
                    description,
                    amount: amount.toString(),
                    paidBy: participantId,
                    createdBy: createdById,
                    splitPercentage: "50.00",
                    projectId,
                  })
                  .returning();

                imported.push(expense[0].id);
                app.logger.debug(
                  {
                    expenseId: expense[0].id,
                    participant: participantName,
                    amount,
                  },
                  "Expense created from import",
                );
              } catch (expenseError) {
                errors.push(
                  `Row ${i + 2} (${participantName}): ${expenseError instanceof Error ? expenseError.message : "Failed to create expense"}`,
                );
              }
            }
          } catch (error) {
            errors.push(
              `Row ${i + 2}: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }
        }

        app.logger.info(
          {
            imported: imported.length,
            errors: errors.length,
            format: isExcel ? "xlsx" : "csv",
          },
          "Expenses imported",
        );
        return {
          imported: imported.length,
          errors,
        };
      } catch (error) {
        app.logger.error({ err: error }, "Failed to import expenses");
        throw error;
      }
    },
  );

  // DELETE /api/expenses/all?projectId=... - Deletes ALL expenses in a project
  app.fastify.delete<{ Querystring: { projectId?: string } }>(
    "/api/expenses/all",
    async (request, reply) => {
      const { projectId } = request.query;
      app.logger.info({ projectId }, "Deleting all expenses in project");
      try {
        const session = await requireAnyAuth(app, request, reply);
        if (!session) return;
        if (!projectId) {
          reply.code(400);
          return { error: "projectId is required" };
        }
        const allExpenses = await app.db
          .select()
          .from(expenses)
          .where(eq(expenses.projectId, projectId));
        const deletedCount = allExpenses.length;
        await app.db.delete(expenses).where(eq(expenses.projectId, projectId));
        return { success: true, deletedCount };
      } catch (error) {
        app.logger.error({ err: error }, "Failed to delete all expenses");
        throw error;
      }
    },
  );
}
