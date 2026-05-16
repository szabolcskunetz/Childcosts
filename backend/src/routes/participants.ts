import { App } from '../index.js';
import { participants, expenses, settlements } from '../db/schema.js';
import { eq, sum, inArray } from 'drizzle-orm';

export function registerParticipantsRoutes(app: App) {
  // GET /api/participants - Returns all participants with colors and createdBy
  app.fastify.get('/api/participants', async (request, reply) => {
    app.logger.info({}, 'Fetching all participants');
    try {
      const allParticipants = await app.db.select().from(participants).orderBy(participants.createdAt);
      app.logger.info({ count: allParticipants.length }, 'Participants fetched successfully');
      return allParticipants.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color || '#3B82F6',
        createdBy: p.createdBy ? { id: p.createdBy } : null,
        createdAt: p.createdAt,
      }));
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to fetch participants');
      throw error;
    }
  });

  // POST /api/participants - Creates participant with optional color and createdBy
  app.fastify.post<{ Body: { name: string; color?: string; createdBy?: string } }>('/api/participants', async (request, reply) => {
    app.logger.info({ body: request.body }, 'Creating new participant');
    try {
      const { name, color = '#3B82F6', createdBy } = request.body;
      const newParticipant = await app.db
        .insert(participants)
        .values({ name, color, createdBy })
        .returning();
      const p = newParticipant[0];
      app.logger.info({ participantId: p.id }, 'Participant created successfully');
      return {
        id: p.id,
        name: p.name,
        color: p.color || '#3B82F6',
        createdBy: p.createdBy ? { id: p.createdBy } : null,
        createdAt: p.createdAt,
      };
    } catch (error) {
      app.logger.error({ err: error, body: request.body }, 'Failed to create participant');
      throw error;
    }
  });

  // PUT /api/participants/:id - Updates participant name and/or color
  app.fastify.put<{ Params: { id: string }; Body: { name?: string; color?: string } }>(
    '/api/participants/:id',
    async (request, reply) => {
      const { id } = request.params;
      app.logger.info({ participantId: id, body: request.body }, 'Updating participant');
      try {
        const { name, color } = request.body;
        const updateData: any = {};
        if (name) updateData.name = name;
        if (color) updateData.color = color;

        if (Object.keys(updateData).length === 0) {
          reply.code(400);
          return { error: 'No fields to update' };
        }

        const updatedParticipant = await app.db
          .update(participants)
          .set(updateData)
          .where(eq(participants.id, id))
          .returning();
        if (updatedParticipant.length === 0) {
          reply.code(404);
          return { error: 'Participant not found' };
        }
        const p = updatedParticipant[0];
        app.logger.info({ participantId: id }, 'Participant updated successfully');
        return {
          id: p.id,
          name: p.name,
          color: p.color || '#3B82F6',
          createdBy: p.createdBy ? { id: p.createdBy } : null,
          createdAt: p.createdAt,
        };
      } catch (error) {
        app.logger.error({ err: error, participantId: id, body: request.body }, 'Failed to update participant');
        throw error;
      }
    }
  );

  // GET /api/participants/balance - Returns balance summary
  app.fastify.get('/api/participants/balance', async (request, reply) => {
    app.logger.info({}, 'Fetching balance summary');
    try {
      const allParticipants = await app.db.select().from(participants);
      const allExpenses = await app.db.select().from(expenses);
      const allSettlements = await app.db.select().from(settlements);

      app.logger.info({ totalExpenses: allExpenses.length }, 'Processing expenses for balance calculation');

      // Create a map to store balance data
      const balanceMap = new Map<string, { id: string; name: string; color: string; totalPaid: number; totalOwed: number; balance: number }>();

      // Initialize balance data for each participant
      for (const p of allParticipants) {
        balanceMap.set(p.id, {
          id: p.id,
          name: p.name,
          color: p.color || '#3B82F6',
          totalPaid: 0,
          totalOwed: 0,
          balance: 0,
        });
      }

      // Track orphaned expenses for logging
      let orphanedExpensesCount = 0;

      // Calculate totalPaid and totalOwed based on correct split logic
      for (let expenseIndex = 0; expenseIndex < allExpenses.length; expenseIndex++) {
        const expense = allExpenses[expenseIndex];
        const expenseAmount = parseFloat(expense.amount as string);
        const splitPercentage = parseFloat(expense.splitPercentage as string);
        const paidByParticipantId = expense.paidBy;
        const paidByData = balanceMap.get(paidByParticipantId);

        // Log expense being processed
        app.logger.debug({
          expenseIndex: expenseIndex + 1,
          expenseId: expense.id,
          amount: expenseAmount,
          splitPercentage,
          paidByParticipantId,
          paidByParticipantName: paidByData?.name || 'MISSING',
        }, `Processing expense ${expenseIndex + 1}/${allExpenses.length}`);

        // Handle orphaned expenses - when payer doesn't exist
        if (!paidByData) {
          orphanedExpensesCount++;
          app.logger.warn({ expenseId: expense.id, missingParticipantId: paidByParticipantId }, 'Expense has missing payer participant - processing as orphaned expense');

          // Still process the expense for split calculations among existing participants
          if (splitPercentage === 0) {
            // Equal split among ALL participants
            const sharePerParticipant = expenseAmount / allParticipants.length;

            // All existing participants owe their share
            const owedBreakdown: Record<string, number> = {};
            for (const otherParticipant of allParticipants) {
              const owedData = balanceMap.get(otherParticipant.id);
              if (owedData) {
                owedData.totalOwed += sharePerParticipant;
                owedBreakdown[otherParticipant.name] = sharePerParticipant;
              }
            }
            app.logger.debug({ owedBreakdown, splitType: 'equal' }, `Orphaned expense split (equal)`);
          } else {
            // Percentage-based split
            // Calculate what the missing payer's share would have been
            const payerShareAmount = (expenseAmount * splitPercentage) / 100;

            // Remaining amount (after the missing payer's share) is split equally among OTHER participants
            const remainingAmount = expenseAmount - payerShareAmount;
            const existingParticipants = allParticipants.filter((p) => p.id !== paidByParticipantId);
            const sharePerExistingParticipant = existingParticipants.length > 0 ? remainingAmount / existingParticipants.length : 0;

            const owedBreakdown: Record<string, number> = {};
            for (const otherParticipant of existingParticipants) {
              const owedData = balanceMap.get(otherParticipant.id);
              if (owedData) {
                owedData.totalOwed += sharePerExistingParticipant;
                owedBreakdown[otherParticipant.name] = sharePerExistingParticipant;
              }
            }
            app.logger.debug({ payerShare: payerShareAmount, owedBreakdown, splitType: 'percentage' }, `Orphaned expense split (percentage)`);
          }
          continue;
        }

        // Add full amount to totalPaid
        paidByData.totalPaid += expenseAmount;
        app.logger.debug({ participantName: paidByData.name, newTotalPaid: paidByData.totalPaid }, `Added to totalPaid`);

        if (splitPercentage === 0) {
          // Equal split among ALL participants (including the payer)
          const sharePerParticipant = expenseAmount / allParticipants.length;

          // Payer owes their share
          paidByData.totalOwed += sharePerParticipant;

          // All other participants owe their share
          const owedBreakdown: Record<string, number> = {};
          owedBreakdown[paidByData.name] = sharePerParticipant;

          for (const otherParticipant of allParticipants) {
            if (otherParticipant.id !== paidByParticipantId) {
              const owedData = balanceMap.get(otherParticipant.id);
              if (owedData) {
                owedData.totalOwed += sharePerParticipant;
                owedBreakdown[otherParticipant.name] = sharePerParticipant;
              }
            }
          }
          app.logger.debug({ owedBreakdown, splitType: 'equal' }, `Split among all participants (equal)`);
        } else {
          // Percentage-based split
          const payerShare = (expenseAmount * splitPercentage) / 100;
          paidByData.totalOwed += payerShare;

          // Remaining amount is split equally among OTHER participants
          const remainingAmount = expenseAmount - payerShare;
          const otherParticipants = allParticipants.filter((p) => p.id !== paidByParticipantId);
          const sharePerOtherParticipant = otherParticipants.length > 0 ? remainingAmount / otherParticipants.length : 0;

          const owedBreakdown: Record<string, number> = {};
          owedBreakdown[paidByData.name] = payerShare;

          for (const otherParticipant of otherParticipants) {
            const owedData = balanceMap.get(otherParticipant.id);
            if (owedData) {
              owedData.totalOwed += sharePerOtherParticipant;
              owedBreakdown[otherParticipant.name] = sharePerOtherParticipant;
            }
          }
          app.logger.debug({ payerShare, remainingAmount, owedBreakdown, splitType: 'percentage' }, `Split among participants (percentage)`);
        }

        // Log running totals after this expense
        const runningTotals: Record<string, { totalPaid: number; totalOwed: number; balance: number }> = {};
        for (const [, data] of balanceMap) {
          runningTotals[data.name] = {
            totalPaid: data.totalPaid,
            totalOwed: data.totalOwed,
            balance: data.totalPaid - data.totalOwed,
          };
        }
        app.logger.debug({ runningTotals }, `Running totals after expense ${expenseIndex + 1}`);
      }

      if (orphanedExpensesCount > 0) {
        app.logger.warn({ orphanedExpensesCount, totalExpenses: allExpenses.length }, 'Found orphaned expenses during balance calculation');
      }

      // Calculate balance and apply settlements
      for (const p of allParticipants) {
        const data = balanceMap.get(p.id)!;
        data.balance = data.totalPaid - data.totalOwed;

        // Apply settlements:
        // A settlement record means money was transferred from one participant to another
        // settlement.fromParticipant → settlement.toParticipant means "from paid money to"
        //
        // CRITICAL: Settlement application logic
        // balance = totalPaid - totalOwed - settlementsReceived + settlementsSent
        //
        // - If you RECEIVE a settlement (toParticipant), someone paid you
        //   Your balance DECREASES (you are owed less money)
        //   Example: You are owed 100 (balance=100), someone pays you 60, your balance becomes 40 (balance decreases by 60)
        // - If you SEND a settlement (fromParticipant), you paid someone
        //   Your balance INCREASES (you owe less money)
        //   Example: You owe 100 (balance=-100), you pay 60, your balance becomes -40 (balance increases by 60)
        //
        // Formula: balance = totalPaid - totalOwed - settlementsReceived + settlementsSent
        for (const settlement of allSettlements) {
          if (settlement.toParticipant === p.id) {
            // You received money - debt/credit to you is reduced
            // This DECREASES your balance
            data.balance -= parseFloat(settlement.amount as string);
          }
          if (settlement.fromParticipant === p.id) {
            // You sent money - you paid off your debt
            // This INCREASES your balance
            data.balance += parseFloat(settlement.amount as string);
          }
        }

        // Log detailed balance for debugging
        app.logger.debug({
          participantName: data.name,
          participantId: data.id,
          totalPaid: data.totalPaid,
          totalOwed: data.totalOwed,
          balance: data.balance,
        }, 'Participant balance calculated');
      }

      const balanceData = Array.from(balanceMap.values());

      // Calculate whoOwesWhom based on FINAL BALANCES (after settlements)
      // This is the key fix - use balanceData with settlements already applied
      const whoOwesWhom: Array<{ from: string; to: string; amount: number }> = [];

      // Separate participants into debtors (negative balance) and creditors (positive balance)
      const debtors = balanceData.filter((b) => b.balance < -0.01).sort((a, b) => a.balance - b.balance); // Most negative first
      const creditors = balanceData.filter((b) => b.balance > 0.01).sort((a, b) => b.balance - a.balance); // Most positive first

      // Create working copies of balances to track what we've settled
      const workingBalances = new Map(balanceData.map((b) => [b.id, b.balance]));

      // Match debtors with creditors to create minimal settlement transactions
      for (const debtor of debtors) {
        let debtAmount = Math.abs(debtor.balance);

        for (const creditor of creditors) {
          const creditAmount = workingBalances.get(creditor.id) || 0;

          if (debtAmount < 0.01 || creditAmount < 0.01) {
            continue;
          }

          const transferAmount = Math.min(debtAmount, creditAmount);

          whoOwesWhom.push({
            from: debtor.name,
            to: creditor.name,
            amount: Math.round(transferAmount * 100) / 100,
          });

          debtAmount -= transferAmount;
          workingBalances.set(creditor.id, creditAmount - transferAmount);
        }
      }

      // Round all balance values to 2 decimal places
      const roundedBalanceData = balanceData.map((b) => ({
        ...b,
        totalPaid: Math.round(b.totalPaid * 100) / 100,
        totalOwed: Math.round(b.totalOwed * 100) / 100,
        balance: Math.round(b.balance * 100) / 100,
      }));

      // Calculate totals for verification
      const totalPaidAcrossAll = roundedBalanceData.reduce((sum, p) => sum + p.totalPaid, 0);
      const totalOwedAcrossAll = roundedBalanceData.reduce((sum, p) => sum + p.totalOwed, 0);
      const totalPaidRounded = Math.round(totalPaidAcrossAll * 100) / 100;
      const totalOwedRounded = Math.round(totalOwedAcrossAll * 100) / 100;
      const totalsMatch = Math.abs(totalPaidRounded - totalOwedRounded) < 0.01;

      // Log comprehensive summary
      const participantSummary = roundedBalanceData.map(p => ({
        name: p.name,
        totalPaid: p.totalPaid,
        totalOwed: p.totalOwed,
        balanceBeforeSettlements: Math.round((p.totalPaid - p.totalOwed) * 100) / 100,
        balanceAfterSettlements: p.balance,
      }));

      app.logger.info({
        totalExpensesProcessed: allExpenses.length,
        orphanedExpensesCount,
        totalParticipants: roundedBalanceData.length,
        participantDetails: participantSummary,
        totals: {
          totalPaidAcrossAllParticipants: totalPaidRounded,
          totalOwedAcrossAllParticipants: totalOwedRounded,
          totalsMatch,
          note: totalsMatch
            ? 'CORRECT: totalPaid equals totalOwed (accounting is balanced)'
            : `WARNING: Mismatch detected! totalPaid (${totalPaidRounded}) !== totalOwed (${totalOwedRounded}). Difference: ${Math.abs(totalPaidRounded - totalOwedRounded)}`
        },
        settlementTransactions: whoOwesWhom.length,
      }, 'Balance summary calculation complete');

      return {
        participants: roundedBalanceData,
        whoOwesWhom: whoOwesWhom.length > 0 ? whoOwesWhom : null,
      };
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to calculate balance summary');
      throw error;
    }
  });

  // DELETE /api/participants/:id - Deletes a participant with ownership verification
  app.fastify.delete<{
    Params: { id: string };
    Querystring: { createdBy?: string };
  }>('/api/participants/:id', async (request, reply) => {
    const { id } = request.params;
    const { createdBy } = request.query;
    app.logger.info({ participantId: id, createdBy }, 'Deleting participant');

    try {
      // Check if participant exists
      const participant = await app.db.select().from(participants).where(eq(participants.id, id));

      if (participant.length === 0) {
        reply.code(404);
        return { error: 'Participant not found' };
      }

      // If createdBy is provided, verify ownership
      if (createdBy && participant[0].createdBy && participant[0].createdBy !== createdBy) {
        reply.code(403);
        return { error: 'Unauthorized: Only creator can delete this participant' };
      }

      await app.db.delete(participants).where(eq(participants.id, id));

      app.logger.info({ participantId: id }, 'Participant deleted successfully');
      return { success: true };
    } catch (error) {
      app.logger.error({ err: error, participantId: id }, 'Failed to delete participant');
      throw error;
    }
  });
}
