import { z } from 'zod';
import { logger } from '../logger.js';
import { KnowledgeGraph } from '../knowledge-graph.js';
import { config } from '../config.js';

const WriteToolSchema = z.object({
  action: z.enum(['add_entities', 'add_relations', 'add_observations']).optional(),
  entities: z
    .array(
      z.object({
        id: z.string().optional(),
        namespace: z.string().optional(),
        type: z.string(),
        value: z.string(),
      })
    ).optional(),
  relations: z
    .array(
      z.object({
        id: z.string().optional(),
        source: z.string(),
        type: z.string(),
        target: z.string(),
        metadata: z.record(z.unknown()).optional(),
      })
    ).optional(),
  observations: z
    .array(
      z.object({
        entityId: z.string(),
        contents: z.array(z.string()),
      })
    ).optional(),
});

export async function memoryWriteTool(args: any) {
  const parsed = WriteToolSchema.safeParse(args);
  if (!parsed.success) {
    logger.warn('Invalid tool call payload', { errors: parsed.error.errors });
    return { content: [{ type: 'text', text: 'Invalid request payload' }] };
  }
  const { action, entities, relations, observations } = parsed.data;

  switch (action) {
    case 'add_entities': {
      if (!entities || entities.length === 0) {
        return { content: [{ type: 'text', text: 'No entities provided' }] };
      }
      const ids: string[] = [];
      for (const e of entities) {
        const id = await KnowledgeGraph.addEntity({ ...e, namespace: config.namespace });
        ids.push(id);
      }
      return { content: [{ type: 'text', text: JSON.stringify({ entityIds: ids }, null, 2) }] };
    }

    case 'add_relations': {
      if (!relations || relations.length === 0) {
        return { content: [{ type: 'text', text: 'No relations provided' }] };
      }
      const ids: string[] = [];
      for (const r of relations) {
        const id = await KnowledgeGraph.addRelation(r.source, r.type, r.target, r.metadata);
        ids.push(id);
      }
      return { content: [{ type: 'text', text: JSON.stringify({ relationIds: ids }, null, 2) }] };
    }

    case 'add_observations': {
      if (!observations || observations.length === 0) {
        return { content: [{ type: 'text', text: 'No observations provided' }] };
      }
      const obsIds: string[] = [];
      for (const o of observations) {
        const entity = { namespace: config.namespace, type: 'observation', value: o.contents.join('\n') };
        const id = await KnowledgeGraph.addEntity(entity);
        obsIds.push(id);
        await KnowledgeGraph.addRelation(o.entityId, 'hasObservation', id, {});
      }
      return { content: [{ type: 'text', text: JSON.stringify({ observationIds: obsIds }, null, 2) }] };
    }

    default:
      return { content: [{ type: 'text', text: `Unknown action: ${action}` }] };
  }
}