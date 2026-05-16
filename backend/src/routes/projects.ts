import { App } from '../index.js';
import { projects, participants, expenses, settlements } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export function registerProjectsRoutes(app: App) {
  // GET /api/projects - list all projects
  app.fastify.get('/api/projects', async (request, reply) => {
    app.logger.info({}, 'Fetching all projects');
    try {
      const allProjects = await app.db.select().from(projects).orderBy(projects.createdAt);
      return allProjects.map((p) => ({
        id: p.id,
        name: p.name,
        createdBy: p.createdBy,
        createdAt: p.createdAt,
      }));
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to fetch projects');
      throw error;
    }
  });

  // POST /api/projects - create new project
  app.fastify.post<{ Body: { name: string; createdBy?: string | null } }>(
    '/api/projects',
    async (request, reply) => {
      const { name, createdBy } = request.body;
      app.logger.info({ name, createdBy }, 'Creating new project');
      try {
        if (!name || !name.trim()) {
          reply.code(400);
          return { error: 'Project name is required' };
        }
        const created = await app.db
          .insert(projects)
          .values({
            name: name.trim(),
            createdBy: createdBy === undefined || createdBy === '' ? null : createdBy,
          })
          .returning();
        return {
          id: created[0].id,
          name: created[0].name,
          createdBy: created[0].createdBy,
          createdAt: created[0].createdAt,
        };
      } catch (error) {
        app.logger.error({ err: error }, 'Failed to create project');
        throw error;
      }
    }
  );

  // PUT /api/projects/:id - rename project
  app.fastify.put<{ Params: { id: string }; Body: { name: string } }>(
    '/api/projects/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { name } = request.body;
      app.logger.info({ id, name }, 'Renaming project');
      try {
        if (!name || !name.trim()) {
          reply.code(400);
          return { error: 'Project name is required' };
        }
        const updated = await app.db
          .update(projects)
          .set({ name: name.trim() })
          .where(eq(projects.id, id))
          .returning();
        if (updated.length === 0) {
          reply.code(404);
          return { error: 'Project not found' };
        }
        return {
          id: updated[0].id,
          name: updated[0].name,
          createdBy: updated[0].createdBy,
          createdAt: updated[0].createdAt,
        };
      } catch (error) {
        app.logger.error({ err: error, id }, 'Failed to rename project');
        throw error;
      }
    }
  );

  // DELETE /api/projects/:id - cascading delete
  app.fastify.delete<{ Params: { id: string } }>(
    '/api/projects/:id',
    async (request, reply) => {
      const { id } = request.params;
      app.logger.info({ id }, 'Deleting project (cascade)');
      try {
        const existing = await app.db.select().from(projects).where(eq(projects.id, id));
        if (existing.length === 0) {
          reply.code(404);
          return { error: 'Project not found' };
        }
        // Cascade delete: explicitly delete dependents to be safe across DB engines
        await app.db.delete(expenses).where(eq(expenses.projectId, id));
        await app.db.delete(settlements).where(eq(settlements.projectId, id));
        await app.db.delete(participants).where(eq(participants.projectId, id));
        await app.db.delete(projects).where(eq(projects.id, id));
        return { success: true };
      } catch (error) {
        app.logger.error({ err: error, id }, 'Failed to delete project');
        throw error;
      }
    }
  );
}
