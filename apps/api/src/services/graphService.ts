import { EntityModel, RelationshipModel } from '../db/models/memory.js';
import { UserModel } from '../db/models/org.js';

const GROUP: Record<string, string> = {
  organization: 'org', department: 'org', team: 'org', location: 'org',
  person: 'people', skill: 'people',
  project: 'projects', objective: 'projects', milestone: 'projects',
  task: 'work', event: 'knowledge', decision: 'knowledge', meeting: 'knowledge',
  document: 'knowledge', client: 'clients', supplier: 'clients', product: 'projects', service: 'projects',
};

/** Compact graph payload for the dashboard's organization graph view. */
export async function getOrganizationGraph(orgId: string) {
  const [entities, relationships, people] = await Promise.all([
    EntityModel.find({ orgId, status: 'active' }).limit(300).lean(),
    RelationshipModel.find({ orgId, status: 'active' }).limit(500).lean(),
    UserModel.find({ orgId, status: { $ne: 'disabled' } }).lean(),
  ]);

  const nodes = entities.map((e) => ({
    id: e._id,
    label: e.name,
    type: e.type,
    group: GROUP[e.type] ?? 'knowledge',
    attributes: e.attributes ?? {},
  }));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = relationships
    .filter((r) => nodeIds.has(r.fromEntityId) && nodeIds.has(r.toEntityId))
    .map((r) => ({ id: r._id, from: r.fromEntityId, to: r.toEntityId, label: r.type, confidence: r.confidence }));

  return {
    nodes,
    edges,
    peopleWithoutGraphEntry: people.filter((p) => !nodes.some((n) => n.type === 'person' && (n.attributes as { userId?: string })?.userId === p._id)).map((p) => ({ id: p._id, name: p.name })),
  };
}
