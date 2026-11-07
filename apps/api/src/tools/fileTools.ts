import { z } from 'zod';
import type { ToolRegistry } from './registry.js';
import { generatePdf } from '../services/fileService.js';
import { searchProjects, getProject } from '../services/projectService.js';
import { generateProjectHealthReport } from '../services/riskService.js';
import { searchTasks } from '../services/taskService.js';

const fmt = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'no date');

export function registerFileTools(reg: ToolRegistry) {
  reg.register({
    name: 'create_pdf_report',
    description: 'Create a polished PDF from a title and sections, and return its download URL. Use this whenever someone asks for a report, document, plan, summary or PDF. The system posts the PDF into the room automatically.',
    tier: 'write',
    input: z.object({
      title: z.string().min(3),
      subtitle: z.string().optional(),
      sections: z.array(z.object({ heading: z.string().min(1), body: z.string().min(1) })).min(1).max(20),
    }),
    handler: async ({ orgId, actor }, input) => {
      const file = await generatePdf({ title: input.title, subtitle: input.subtitle, sections: input.sections });
      return { ...file, note: 'The PDF is attached to your reply automatically; include this URL only if useful.' };
    },
  });

  reg.register({
    name: 'create_project_status_pdf',
    description: 'Generate a ready-made project status PDF from real project data (tasks, owners, deadlines, risks) and return its URL. Use when asked for a project report or status PDF.',
    tier: 'write',
    input: z.object({ projectName: z.string().optional() }),
    handler: async ({ orgId }, input) => {
      const projects = await searchProjects(orgId, {});
      const project = input.projectName
        ? projects.find((p) => p.name.toLowerCase().includes(input.projectName!.toLowerCase()))
        : projects.find((p) => p.status === 'active') ?? projects[0];
      if (!project) throw new Error('No project found to report on');
      const [detail, report, tasks] = await Promise.all([
        getProject(orgId, project.id),
        generateProjectHealthReport(orgId, project.id),
        searchTasks(orgId, { projectId: project.id, limit: 50 }),
      ]);
      const taskLines = tasks
        .map((t) => `• ${t.title} — ${(t.assignees ?? []).map((a) => a.name).join(', ') || 'unassigned'} · ${t.status.replace(/_/g, ' ')} · due ${fmt(t.dueDate)}`)
        .join('\n') || 'No tasks recorded.';
      const riskLines = report.risks
        .map((r) => `• [${r.severity.toUpperCase()}] ${r.title} — ${r.detail} Recommendation: ${r.recommendation}`)
        .join('\n') || 'No material risks detected.';

      const file = await generatePdf({
        title: `${project.name} — Status Report`,
        subtitle: `Generated ${new Date().toLocaleString('en-GB')} · TEAMFORGE`,
        sections: [
          { heading: 'At a glance', body: [
            `Status: ${project.status}`,
            `Health: ${report.project.health.replace(/_/g, ' ')}`,
            `Deadline: ${fmt(project.dueDate)}`,
            `Owner: ${detail?.owner?.name ?? 'unassigned'}`,
            `Tasks: ${report.stats.totalTasks} total · ${report.stats.openTasks} open · ${report.stats.doneTasks} done · ${report.stats.overdueTasks} overdue · ${report.stats.blockedTasks} blocked`,
          ].join('\n') },
          { heading: 'Work in flight', body: taskLines },
          { heading: 'Risks and dependencies', body: riskLines },
          { heading: 'Notes', body: 'This report was generated from the live project record at the moment of the request. Numbers and statuses are not estimates.' },
        ],
      });
      return { ...file, projectId: project.id, projectName: project.name, note: 'The PDF is attached to your reply automatically.' };
    },
  });
}
