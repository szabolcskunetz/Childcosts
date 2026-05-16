// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.
import { App } from '../index.js';
import { participants, expenses, settlements } from '../db/schema.js';
import { eq, and, sum, inArray } from 'drizzle-orm';

export function registerParticipantsRoutes(app: App) {
  // GET /api/participants?projectId=... - participants for a project
  app.fastify.get<{ Querystring: { projectId?: string } }>(
    '/api/participants',
    async (request, reply) => {
      const { projectId } = request.query;
      app.logger.info({ projectId }, 'Fetching participants');
      try {
        if (!projectId) {
          reply.code(400);
          return { error: 'projectId is required' };
        }
        const list = await app.db
          .select()
          .from(participants)
          .where(eq(participants.projectId, projectId))
          .orderBy(participants.createdAt);
        return list.map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color || '#3B82F6',
          projectId: p.projectId,
          createdBy: p.createdBy ? { id: p.createdBy } : null,
          createdAt: p.createdAt,
        }));
      } catch (error) {
        app.logger.error({ err: error }, 'Failed to fetch participants');
        throw error;
      }
    }
  );

  // POST /api/participants - requires projectId in body
  app.fastify.post<{
    Body: { name: string; color?: string; createdBy?: string; projectId: string };
  }>('/api/participants', async (request, reply) => {
    app.logger.info({ body: request.body }, 'Creating new participant');
    try {
      const { name, color = '#3B82F6', createdBy, projectId } = request.body;
      if (!projectId) {
        reply.code(400);
        return { error: 'projectId is required' };
      }
      const created = await app.db
        .insert(participants)
        .values({ name, color, createdBy, projectId })
        .returning();
      const p = created[0];
      return {
        id: p.id,
        name: p.name,
        color: p.color || '#3B82F6',
        projectId: p.projectId,
        createdBy: p.createdBy ? { id: p.createdBy } : null,
        createdAt: p.createdAt,
      };
    } catch (error) {
      app.logger.error({ err: error, body: request.body }, 'Failed to create participant');
      throw error;
    }
  });

  // PUT /api/participants/:id - update name/color
  app.fastify.put<{ Params: { id: string }; Body: { name?: string; color?: string } }>(
    '/api/participants/:id',
    async (request, reply) => {
      const { id } = request.params;
      try {
        const { name, color } = request.body;
        const updateData: any = {};
        if (name) updateData.name = name;
        if (color) updateData.color = color;
        if (Object.keys(updateData).length === 0) {
          reply.code(400);
          return { error: 'No fields to update' };
        }
        const updated = await app.db
          .update(participants)
          .set(updateData)
          .where(eq(participants.id, id))
          .returning();
        if (updated.length === 0) {
          reply.code(404);
          return { error: 'Participant not found' };
        }
        const p = updated[0];
        return {
          id: p.id,
          name: p.name,
          color: p.color || '#3B82F6',
          projectId: p.projectId,
          createdBy: p.createdBy ? { id: p.createdBy } : null,
          createdAt: p.createdAt,
        };
      } catch (error) {
        app.logger.error({ err: error, id, body: request.body }, 'Failed to update participant');
        throw error;
      }
    }
  );

  // GET /api/participants/balance?projectId=... - balance summary
  app.fastify.get<{ Querystring: { projectId?: string } }>(
    '/api/participants/balance',
    async (request, reply) => {
      const { projectId } = request.query;
      app.logger.info({ projectId }, 'Fetching balance summary');
      try {
        if (!projectId) {
          reply.code(400);
          return { error: 'projectId is required' };
        }
        const allParticipants = await app.db
          .select()
          .from(participants)
          .where(eq(participants.projectId, projectId));
        const allExpenses = await app.db
          .select()
          .from(expenses)
          .where(eq(expenses.projectId, projectId));
        const allSettlements = await app.db
          .select()
          .from(settlements)
          .where(eq(settlements.projectId, projectId));

        const balanceMap = new Map<
          string,
          { id: string; name: string; color: string; totalPaid: number; totalOwed: number; balance: number }
        >();

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

        for (const expense of allExpenses) {
          const expenseAmount = parseFloat(expense.amount as string);
          const splitPercentage = parseFloat(expense.splitPercentage as string);
          const paidByParticipantId = expense.paidBy;
          const paidByData = balanceMap.get(paidByParticipantId);

          if (!paidByData) continue;

          paidByData.totalPaid += expenseAmount;

          if (splitPercentage === 0) {
            const share = expenseAmount / allParticipants.length;
            paidByData.totalOwed += share;
            for (const op of allParticipants) {
              if (op.id !== paidByParticipantId) {
                const data = balanceMap.get(op.id);
                if (data) data.totalOwed += share;
              }
            }
          } else {
            const payerShare = (expenseAmount * splitPercentage) / 100;
            paidByData.totalOwed += payerShare;
            const remaining = expenseAmount - payerShare;
            const others = allParticipants.filter((p) => p.id !== paidByParticipantId);
            const sharePerOther = others.length > 0 ? remaining / others.length : 0;
            for (const op of others) {
              const data = balanceMap.get(op.id);
              if (data) data.totalOwed += sharePerOther;
            }
          }
        }

        for (const p of allParticipants) {
          const data = balanceMap.get(p.id)!;
          data.balance = data.totalPaid - data.totalOwed;
          for (const settlement of allSettlements) {
            if (settlement.toParticipant === p.id) {
              data.balance -= parseFloat(settlement.amount as string);
            }
            if (settlement.fromParticipant === p.id) {
              data.balance += parseFloat(settlement.amount as string);
            }
          }
        }

        const balanceData = Array.from(balanceMap.values());
        const whoOwesWhom: Array<{ from: string; to: string; amount: number }> = [];
        const debtors = balanceData.filter((b) => b.balance < -0.01).sort((a, b) => a.balance - b.balance);
        const creditors = balanceData.filter((b) => b.balance > 0.01).sort((a, b) => b.balance - a.balance);
        const workingBalances = new Map(balanceData.map((b) => [b.id, b.balance]));

        for (const debtor of debtors) {
          let debtAmount = Math.abs(debtor.balance);
          for (const creditor of creditors) {
            const creditAmount = workingBalances.get(creditor.id) || 0;
            if (debtAmount < 0.01 || creditAmount < 0.01) continue;
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

        const rounded = balanceData.map((b) => ({
          ...b,
          totalPaid: Math.round(b.totalPaid * 100) / 100,
          totalOwed: Math.round(b.totalOwed * 100) / 100,
          balance: Math.round(b.balance * 100) / 100,
        }));

        return {
          participants: rounded,
          whoOwesWhom: whoOwesWhom.length > 0 ? whoOwesWhom : null,
        };
      } catch (error) {
        app.logger.error({ err: error }, 'Failed to calculate balance summary');
        throw error;
      }
    }
  );

  // DELETE /api/participants/:id
  app.fastify.delete<{
    Params: { id: string };
    Querystring: { createdBy?: string };
  }>('/api/participants/:id', async (request, reply) => {
    const { id } = request.params;
    const { createdBy } = request.query;
    try {
      const participant = await app.db.select().from(participants).where(eq(participants.id, id));
      if (participant.length === 0) {
        reply.code(404);
        return { error: 'Participant not found' };
      }
      if (createdBy && participant[0].createdBy && participant[0].createdBy !== createdBy) {
        reply.code(403);
        return { error: 'Unauthorized: Only creator can delete this participant' };
      }
      await app.db.delete(participants).where(eq(participants.id, id));
      return { success: true };
    } catch (error) {
      app.logger.error({ err: error, id }, 'Failed to delete participant');
      throw error;
    }
  });
}
