// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.
import { App } from '../index.js';
import { settlements, participants } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export function registerSettlementsRoutes(app: App) {
  // GET /api/settlements?projectId=...
  app.fastify.get<{ Querystring: { projectId?: string } }>(
    '/api/settlements',
    async (request, reply) => {
      const { projectId } = request.query;
      app.logger.info({ projectId }, 'Fetching settlements');
      try {
        if (!projectId) {
          reply.code(400);
          return { error: 'projectId is required' };
        }
        const allSettlements = await app.db
          .select()
          .from(settlements)
          .where(eq(settlements.projectId, projectId))
          .orderBy(settlements.createdAt);

        const enriched = await Promise.all(
          allSettlements.map(async (settlement) => {
            const fromP = await app.db.select().from(participants).where(eq(participants.id, settlement.fromParticipant));
            const toP = await app.db.select().from(participants).where(eq(participants.id, settlement.toParticipant));
            return {
              id: settlement.id,
              date: settlement.date,
              fromParticipant: fromP[0]
                ? { id: fromP[0].id, name: fromP[0].name, color: fromP[0].color || '#3B82F6' }
                : null,
              toParticipant: toP[0]
                ? { id: toP[0].id, name: toP[0].name, color: toP[0].color || '#3B82F6' }
                : null,
              amount: parseFloat(settlement.amount as string),
              description: settlement.description,
              projectId: settlement.projectId,
              createdAt: settlement.createdAt,
            };
          })
        );
        return enriched;
      } catch (error) {
        app.logger.error({ err: error }, 'Failed to fetch settlements');
        throw error;
      }
    }
  );

  // POST /api/settlements - requires projectId in body
  app.fastify.post<{
    Body: {
      date: string;
      fromParticipant: string;
      toParticipant: string;
      amount: number;
      description?: string;
      projectId: string;
    };
  }>('/api/settlements', async (request, reply) => {
    app.logger.info({ body: request.body }, 'Creating settlement');
    try {
      const {
        date,
        fromParticipant,
        toParticipant,
        amount,
        description = 'Settlement',
        projectId,
      } = request.body;
      if (!projectId) {
        reply.code(400);
        return { error: 'projectId is required' };
      }
      const created = await app.db
        .insert(settlements)
        .values({
          date: new Date(date),
          fromParticipant,
          toParticipant,
          amount: amount.toString(),
          description,
          projectId,
        })
        .returning();
      const fromP = await app.db.select().from(participants).where(eq(participants.id, fromParticipant));
      const toP = await app.db.select().from(participants).where(eq(participants.id, toParticipant));
      return {
        id: created[0].id,
        date: created[0].date,
        fromParticipant: fromP[0]
          ? { id: fromP[0].id, name: fromP[0].name, color: fromP[0].color || '#3B82F6' }
          : null,
        toParticipant: toP[0]
          ? { id: toP[0].id, name: toP[0].name, color: toP[0].color || '#3B82F6' }
          : null,
        amount: parseFloat(created[0].amount as string),
        description: created[0].description,
        projectId: created[0].projectId,
        createdAt: created[0].createdAt,
      };
    } catch (error) {
      app.logger.error({ err: error, body: request.body }, 'Failed to create settlement');
      throw error;
    }
  });

  // DELETE /api/settlements/:id
  app.fastify.delete<{ Params: { id: string } }>(
    '/api/settlements/:id',
    async (request, reply) => {
      const { id } = request.params;
      try {
        const settlement = await app.db.select().from(settlements).where(eq(settlements.id, id));
        if (settlement.length === 0) {
          reply.code(404);
          return { error: 'Settlement not found' };
        }
        await app.db.delete(settlements).where(eq(settlements.id, id));
        return { success: true };
      } catch (error) {
        app.logger.error({ err: error, id }, 'Failed to delete settlement');
        throw error;
      }
    }
  );
}
