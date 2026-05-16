import { App } from '../index.js';
import { settlements, participants } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export function registerSettlementsRoutes(app: App) {
  // GET /api/settlements - Returns all settlements
  app.fastify.get('/api/settlements', async (request, reply) => {
    app.logger.info({}, 'Fetching all settlements');

    try {
      const allSettlements = await app.db
        .select()
        .from(settlements)
        .orderBy(settlements.createdAt);

      // Fetch participant details for each settlement
      const enrichedSettlements = await Promise.all(
        allSettlements.map(async (settlement) => {
          const fromParticipant = await app.db
            .select()
            .from(participants)
            .where(eq(participants.id, settlement.fromParticipant));

          const toParticipant = await app.db
            .select()
            .from(participants)
            .where(eq(participants.id, settlement.toParticipant));

          return {
            id: settlement.id,
            date: settlement.date,
            fromParticipant: fromParticipant[0]
              ? {
                  id: fromParticipant[0].id,
                  name: fromParticipant[0].name,
                  color: fromParticipant[0].color || '#3B82F6',
                }
              : null,
            toParticipant: toParticipant[0]
              ? {
                  id: toParticipant[0].id,
                  name: toParticipant[0].name,
                  color: toParticipant[0].color || '#3B82F6',
                }
              : null,
            amount: parseFloat(settlement.amount as string),
            description: settlement.description,
            createdAt: settlement.createdAt,
          };
        })
      );

      app.logger.info({ count: enrichedSettlements.length }, 'Settlements fetched successfully');
      return enrichedSettlements;
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to fetch settlements');
      throw error;
    }
  });

  // POST /api/settlements - Creates settlement
  app.fastify.post<{
    Body: {
      date: string;
      fromParticipant: string;
      toParticipant: string;
      amount: number;
      description?: string;
    };
  }>('/api/settlements', async (request, reply) => {
    app.logger.info({ body: request.body }, 'Creating new settlement');

    try {
      const {
        date,
        fromParticipant,
        toParticipant,
        amount,
        description = 'Settlement',
      } = request.body;

      const newSettlement = await app.db
        .insert(settlements)
        .values({
          date: new Date(date),
          fromParticipant,
          toParticipant,
          amount: amount.toString(),
          description,
        })
        .returning();

      // Fetch participant details
      const fromParticipantData = await app.db
        .select()
        .from(participants)
        .where(eq(participants.id, fromParticipant));

      const toParticipantData = await app.db
        .select()
        .from(participants)
        .where(eq(participants.id, toParticipant));

      const result = {
        id: newSettlement[0].id,
        date: newSettlement[0].date,
        fromParticipant: fromParticipantData[0]
          ? {
              id: fromParticipantData[0].id,
              name: fromParticipantData[0].name,
              color: fromParticipantData[0].color || '#3B82F6',
            }
          : null,
        toParticipant: toParticipantData[0]
          ? {
              id: toParticipantData[0].id,
              name: toParticipantData[0].name,
              color: toParticipantData[0].color || '#3B82F6',
            }
          : null,
        amount: parseFloat(newSettlement[0].amount as string),
        description: newSettlement[0].description,
        createdAt: newSettlement[0].createdAt,
      };

      app.logger.info({ settlementId: newSettlement[0].id }, 'Settlement created successfully');
      return result;
    } catch (error) {
      app.logger.error({ err: error, body: request.body }, 'Failed to create settlement');
      throw error;
    }
  });

  // DELETE /api/settlements/:id - Deletes a settlement
  app.fastify.delete<{
    Params: { id: string };
  }>('/api/settlements/:id', async (request, reply) => {
    const { id } = request.params;
    app.logger.info({ settlementId: id }, 'Deleting settlement');

    try {
      // Check if settlement exists
      const settlement = await app.db.select().from(settlements).where(eq(settlements.id, id));

      if (settlement.length === 0) {
        reply.code(404);
        return { error: 'Settlement not found' };
      }

      await app.db.delete(settlements).where(eq(settlements.id, id));

      app.logger.info({ settlementId: id }, 'Settlement deleted successfully');
      return { success: true };
    } catch (error) {
      app.logger.error({ err: error, settlementId: id }, 'Failed to delete settlement');
      throw error;
    }
  });
}
