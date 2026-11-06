import { ToolRegistry } from './registry.js';
import { registerOrgTools } from './orgTools.js';
import { registerMemoryTools } from './memoryTools.js';
import { registerProjectTools } from './projectTools.js';
import { registerTaskTools } from './taskTools.js';
import { registerCoordinationTools } from './coordinationTools.js';
import { registerSchedulingTools } from './schedulingTools.js';
import { registerRiskTools } from './riskTools.js';
import { registerPeopleTools } from './peopleTools.js';

export function buildToolRegistry(): ToolRegistry {
  const reg = new ToolRegistry();
  registerOrgTools(reg);
  registerMemoryTools(reg);
  registerProjectTools(reg);
  registerTaskTools(reg);
  registerCoordinationTools(reg);
  registerSchedulingTools(reg);
  registerRiskTools(reg);
  registerPeopleTools(reg);
  return reg;
}

export { ToolRegistry };
