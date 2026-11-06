# MASTER BUILD PROMPT — TEAMFORGE
## Build an AI-Powered Organizational Intelligence & Operations Platform, Powered by Switch

You are a senior software architect, full-stack engineer, AI agent engineer, and product designer.

Build the first working version of **TEAMFORGE**, a production-minded, extensible AI operations manager for business organizations.

Do not build a generic chatbot, a basic project management application, or six independent AI bots.

Build a collaborative multi-agent business operating system in which humans and AI agents work together through **Switch**.

The application should understand an organization's people, skills, responsibilities, projects, decisions, tasks, commitments, conversations, relationships, and timelines. It should continuously build organizational memory and use that knowledge to coordinate work proactively.

The core principle:

**TEAMFORGE listens to authorized team conversations, understands the organization, identifies what needs to happen, brings the right people and agents together, and helps get the work completed.**

---

# 1. PRODUCT VISION

TEAMFORGE is an AI Operations Manager for businesses.

Imagine an organization with:
- A founder.
- Engineering team.
- Product team.
- Marketing team.
- Sales team.
- Project managers.
- Employees with different responsibilities and expertise.

The organization communicates through Discord, connected to Switch.

TEAMFORGE should be able to understand conversations naturally, without requiring people to use commands or mention an AI agent.

For example:

A founder writes:

"We need to launch our new website by Friday. Priya will handle the design, Aarav will handle the backend, and Neha will handle frontend integration."

TEAMFORGE should:

1. Understand the project objective.
2. Identify the people mentioned.
3. Resolve their identities against existing organization records.
4. Understand their existing roles and responsibilities.
5. Extract proposed assignments.
6. Identify deadlines and dependencies.
7. Create structured task proposals.
8. Ask for confirmation when assignments or consequential changes require approval.
9. Store confirmed information in organizational memory.
10. Coordinate the work through Switch.
11. Monitor progress.
12. Detect blockers.
13. Proactively follow up.
14. Produce useful operational reports.

The system should work for different types of organizations, not just software startups.

Support businesses, agencies, product teams, marketing teams, consulting companies, internal operations teams, and other organizations.

Do not hardcode specific employee names, departments, job titles, project types, or business workflows.

---

# 2. MOST IMPORTANT ARCHITECTURAL REQUIREMENT: SWITCH IS CENTRAL

This is a Switch-focused hackathon project.

Switch must be a genuine, essential component of the architecture.

Do not implement six independent agents in Node.js and merely pretend that Switch is being used.

Do not build a separate Node.js orchestration system that bypasses Switch for all agent-to-agent collaboration.

Do not make Switch an optional integration.

## Switch responsibilities

Use Switch for:

- Connecting Discord and other supported communication channels.
- Shared human-agent rooms.
- Agent registration and participation.
- Agent identities and roles.
- Agent instructions and capabilities.
- Room membership and permissions.
- Shared conversation context.
- Agent-to-agent delegation.
- Agent handoffs.
- Cross-room collaboration.
- Bootstrap or manager-agent workflows.
- Human-agent collaboration.
- Communication between agents working on the same business objective.

Use the documented Switch integration mechanisms and Agent Protocol.

### Mandatory first step: inspect Switch

Before writing integration code:

1. Inspect the official Switch documentation:
   https://docs.switchagents.ai/

2. Inspect the official repository:
   https://github.com/sandbox-quantum/switch

3. Understand the actual current Agent Protocol.
4. Understand authentication and registration.
5. Understand event delivery and subscriptions.
6. Understand how agents receive messages.
7. Understand how agents send messages.
8. Understand room management and membership.
9. Understand handoffs and delegation.
10. Understand how Discord channels map to Switch rooms.
11. Understand the supported MCP integration mechanisms.
12. Identify what can be configured and what requires custom development.

Use actual documented endpoints, event formats, authentication mechanisms, SDKs, and protocols.

NEVER invent Switch APIs, endpoints, event types, authentication methods, or configuration properties.

If the documentation or installed Switch version differs from assumptions, follow the actual implementation.

Create:

`docs/SWITCH_INTEGRATION.md`

Document:
- Switch architecture.
- Connection mechanism.
- Agent registration.
- Event lifecycle.
- Message flow.
- Tool integration.
- Agent handoffs.
- Discord integration.
- Required configuration.
- Known limitations.

### Our preferred Switch architecture

Use Switch-managed/custom agents according to the supported integration model.

Our Node.js backend should expose TEAMFORGE business capabilities as tools through MCP or the appropriate documented tool integration.

Agents should use these tools to access organization data.

The Operations Manager should act as the primary coordination agent.

Specialist agents should collaborate through Switch rooms and documented handoffs.

For a complex task, the Operations Manager should:
- Understand the request.
- Identify the appropriate specialists.
- Delegate tasks through Switch.
- Provide the necessary context.
- Collect specialist findings.
- Invite relevant human teammates.
- Coordinate the workflow.
- Produce a unified outcome.

The Node.js backend must not replace Switch's agent collaboration capabilities.

### Discord experience

The human team should be able to communicate naturally.

Ideally, a team member can write:

"Who is currently handling the payment integration?"

The relevant agent should respond without requiring an @mention, where supported by the Switch connector and agent configuration.

Configure the Operations Manager as the primary conversational entry point.

Specialists should participate when relevant, not all respond to every message.

If automatic no-mention routing is not supported by the selected connector, document the limitation and implement the most reliable supported approach. Never pretend it works.

---

# 3. SIX SPECIALIZED AI AGENTS

Create six clearly defined agents.

All six should have separate identities, responsibilities, instructions, and tools.

They should collaborate through Switch.

## Agent 1: AI Operations Manager

Role: Chief AI teammate and organizational coordinator.

Responsibilities:

- Understand ordinary team conversations.
- Understand business objectives.
- Coordinate specialist agents.
- Delegate work through Switch.
- Open or use appropriate collaboration rooms.
- Bring relevant humans and agents into workflows.
- Collect missing information.
- Resolve conflicting recommendations.
- Maintain awareness of organizational context.
- Track the status of major objectives.
- Coordinate human approvals.
- Produce unified responses.
- Initiate proactive operational workflows.

It should not independently invent employee responsibilities, assign sensitive work without permission, or make irreversible decisions.

It should use organizational memory and other specialist agents before making important recommendations.

## Agent 2: Project Manager Agent

Responsibilities:

- Understand projects.
- Identify tasks and action items.
- Create task proposals.
- Identify owners.
- Identify deadlines.
- Identify priorities.
- Understand task dependencies.
- Track milestones.
- Monitor project status.
- Detect stalled tasks.
- Recommend schedule changes.
- Collect completion updates.
- Prepare project reports.

It should understand natural language such as:

"We should get the prototype ready before the investor meeting next Thursday."

It should identify the deliverable, relevant date, potential owner and context.

## Agent 3: Knowledge & Memory Agent

This is one of the most important agents.

Its responsibility is maintaining the organization's evolving memory.

It must understand:

- Employees.
- Roles.
- Skills.
- Departments.
- Teams.
- Projects.
- Clients.
- Suppliers.
- Tasks.
- Commitments.
- Decisions.
- Meetings.
- Events.
- Business rules.
- Relationships.
- Historical changes.
- Organizational terminology.

It should extract information from authorized conversations and other connected sources.

It must resolve references to existing entities and avoid duplicate records.

It should detect contradictory information and ask for clarification when necessary.

It should preserve historical facts rather than silently overwrite them.

## Agent 4: Communication & Coordination Agent

Responsibilities:

- Collect status updates.
- Draft internal messages.
- Follow up on unanswered questions.
- Prepare meeting summaries.
- Extract meeting action items.
- Coordinate handoffs.
- Notify relevant team members.
- Draft client communications.
- Prepare weekly summaries.

It must respect communication permissions and obtain approval before sending external or sensitive communications.

## Agent 5: Research & Strategy Agent

Responsibilities:

- Research business questions.
- Analyze competitors.
- Investigate market opportunities.
- Analyze customer feedback.
- Research potential solutions.
- Produce recommendations.
- Collect supporting sources.
- Present findings to the team.

Do not fabricate research or sources.

## Agent 6: Quality & Risk Agent

Responsibilities:

- Identify overdue tasks.
- Detect conflicting deadlines.
- Identify project dependencies.
- Detect blockers.
- Identify contradictory decisions.
- Evaluate operational risks.
- Monitor milestone health.
- Identify potential delivery problems.
- Recommend corrective actions.

Example:

Aarav's API integration is delayed.

The Risk Agent identifies that Neha's frontend integration depends on that API and that the marketing launch depends on the completed website.

It should explain the downstream impact and recommend solutions.

---

# 4. NODE.JS BACKEND: TEAMFORGE'S BUSINESS INTELLIGENCE ENGINE

Build the backend using:

- Node.js.
- TypeScript.
- Express or Fastify.
- PostgreSQL.
- Prisma or Drizzle ORM.
- Zod for schema validation.
- MCP SDK where supported by the selected agent integration.
- Background workers for scheduling.
- Docker Compose.

PostgreSQL should be the source of truth.

Use JSONB for flexible entity attributes and organization-specific metadata.

Use pgvector only if useful and available for semantic retrieval.

Do not introduce unnecessary infrastructure or microservices.

Use a modular monolith for the MVP.

## Backend responsibilities

The backend is responsible for:

1. Organization data.
2. Employee records.
3. Business entities.
4. Organizational memory.
5. Knowledge graph relationships.
6. Task management.
7. Commitments.
8. Projects.
9. Deadlines.
10. Approvals.
11. Reminders.
12. Scheduling.
13. Event history.
14. Audit logs.
15. Authentication and permissions.
16. Agent tool execution.
17. Validation of agent proposals.

The backend must be independent of any particular business type.

A company should be able to create its own departments, teams, roles, custom entity types, attributes, and workflows.

Do not hardcode a startup-specific data model.

---

# 5. DYNAMIC ORGANIZATIONAL MEMORY

This is a core differentiator of TEAMFORGE.

Do not build memory as a giant text file or a collection of conversation summaries.

Implement a structured, interconnected, temporal organizational knowledge graph.

## 5.1 Core concepts

### Entities

An entity represents anything meaningful in an organization.

Examples:

- Person.
- Department.
- Team.
- Project.
- Task.
- Client.
- Supplier.
- Product.
- Service.
- Meeting.
- Document.
- Business objective.
- Location.
- Asset.
- Custom organization-specific entity.

Entity types must be extensible.

### Relationships

Relationships connect entities.

Examples:

- Person WORKS_FOR Organization.
- Person MEMBER_OF Team.
- Person REPORTS_TO Person.
- Person HAS_SKILL Skill.
- Person OWNS Task.
- Person WORKS_ON Project.
- Project HAS_TASK Task.
- Task DEPENDS_ON Task.
- Task BLOCKS Task.
- Project BELONGS_TO Department.
- Employee COLLABORATES_WITH Employee.
- Decision AFFECTS Project.
- Commitment MADE_BY Person.
- Document RELATES_TO Project.

Relationships must be dynamic and support custom relationship types.

### Facts

Facts represent claims or attributes about entities.

Examples:

- Aarav is a backend developer.
- Priya is responsible for design.
- The project deadline is Friday.
- The team uses React.
- A client prefers weekly updates.

Do not hardcode a fixed list of all possible facts.

Support flexible predicates and structured values.

### Events

Events represent things that happened.

Examples:

- Employee joined.
- Project started.
- Deadline changed.
- Task completed.
- Decision made.
- Meeting held.
- Responsibility transferred.
- Client request received.
- Project blocked.

### Sources

Every important extracted memory must retain its origin.

Examples:

- Discord message ID.
- Switch room ID.
- User ID.
- Document ID.
- Meeting ID.
- External integration reference.

Do not lose provenance.

## 5.2 Temporal memory

Every important fact should support:

- `valid_from`: when it became true.
- `valid_until`: when it stopped being true.
- `recorded_at`: when TEAMFORGE learned it.
- `confidence`: how certain the system is.
- `source_id`: where it came from.
- `status`: active, proposed, superseded, disputed, or rejected.
- `visibility_scope`: who is allowed to access it.

Preserve old information.

Example:

Monday:
Aarav is responsible for backend development.

Wednesday:
Priya takes over backend development.

Do not delete the old assignment.

Record:

- Aarav's responsibility ends Wednesday.
- Priya's responsibility begins Wednesday.
- The change is associated with the relevant source and decision.

TEAMFORGE should answer:

"Who originally handled backend development?"

And:

"Who is responsible now?"

Both answers should be possible.

## 5.3 Memory extraction pipeline

Implement a dedicated memory ingestion pipeline.

Whenever an authorized message arrives:

1. Receive the message event.
2. Extract potential entities.
3. Identify facts and events.
4. Identify people and aliases.
5. Resolve entities against existing records.
6. Identify potential relationships.
7. Detect duplicate facts.
8. Detect contradictory facts.
9. Determine temporal information.
10. Evaluate confidence.
11. Determine whether approval is necessary.
12. Create a structured memory proposal.
13. Validate the proposal in the backend.
14. Apply approved changes.
15. Preserve the original source.
16. Record the update in the audit log.
17. Make the updated memory available to agents.

Use LLM-assisted extraction, but never let unvalidated LLM output directly mutate the database.

## 5.4 Entity resolution

Example conversation:

"Aarav will handle the backend."

Later:

"Aaru says the API is ready."

TEAMFORGE should determine whether Aaru is an alias for Aarav.

If confidence is high and the identity is established, link the alias.

If ambiguous, ask for clarification.

Do not create duplicate employee records casually.

## 5.5 Memory retrieval

Support:

- Entity-based lookup.
- Relationship traversal.
- Fact retrieval.
- Historical lookup.
- Temporal queries.
- Semantic retrieval.
- Source retrieval.
- Organization-wide queries subject to permissions.

Examples:

"Who handles frontend?"

"What is Priya working on?"

"What did we decide about pricing last week?"

"Which tasks are waiting on Aarav?"

"Who owns the payment integration?"

"What changed in the project timeline?"

"Which clients have unresolved requests?"

The answers must be grounded in stored records and sources.

---

# 6. CORE DATABASE DESIGN

Design normalized PostgreSQL tables with flexible metadata.

At minimum, create:

## Organization

- organizations
- organization_settings
- departments
- teams
- team_memberships
- roles
- permissions

## People

- users
- employee_profiles
- skills
- employee_skills
- aliases
- reporting_relationships
- availability

## Knowledge graph

- entities
- entity_types
- relationships
- relationship_types
- facts
- events
- sources
- memory_proposals
- memory_versions
- entity_aliases

## Operations

- projects
- project_memberships
- tasks
- task_assignments
- task_dependencies
- milestones
- commitments
- goals
- approvals
- decisions
- meetings
- documents

## Communication

- conversations
- messages
- room_mappings
- channel_permissions
- notifications

## Automation

- reminders
- scheduled_jobs
- recurring_schedules
- proactive_events

## Governance

- audit_logs
- agent_actions
- access_policies
- user_preferences
- integration_credentials_metadata

Use UUID primary keys.

Include organization IDs and appropriate tenant-scoping in all relevant records.

Add indexes for:
- Entity lookups.
- Organization filtering.
- Task status.
- Assignees.
- Deadlines.
- Relationship traversal.
- Source references.
- Time-based queries.

Create migrations.

Never store raw passwords or API secrets in the database as ordinary text.

---

# 7. AGENT TOOLING THROUGH NODE.JS

Expose a structured collection of TEAMFORGE tools through MCP or the documented Switch-compatible tool integration.

These tools must call real backend services.

Do not build fake tool implementations.

## Organization tools

- `get_organization_profile`
- `get_departments`
- `get_teams`
- `get_team_members`
- `get_employee_profile`
- `search_employees`
- `get_employee_skills`
- `get_employee_workload`
- `get_organization_overview`

## Memory tools

- `search_organization_memory`
- `get_entity`
- `find_entity`
- `get_entity_relationships`
- `get_entity_history`
- `get_fact_history`
- `propose_memory_update`
- `confirm_memory_update`
- `correct_memory`
- `record_event`
- `record_decision`

## Project tools

- `create_project`
- `get_project`
- `search_projects`
- `update_project`
- `get_project_timeline`
- `get_project_health`

## Task tools

- `propose_task`
- `create_task`
- `get_task`
- `search_tasks`
- `update_task`
- `assign_task`
- `get_task_dependencies`
- `create_task_dependency`
- `complete_task`
- `get_overdue_tasks`

## Coordination tools

- `request_status_update`
- `create_follow_up`
- `propose_reassignment`
- `propose_deadline_change`
- `create_approval_request`
- `get_pending_approvals`
- `record_handoff`

## Scheduling tools

- `create_reminder`
- `update_reminder`
- `cancel_reminder`
- `get_upcoming_deadlines`
- `schedule_recurring_followup`

## Risk tools

- `analyze_project_risks`
- `find_blocked_tasks`
- `get_affected_dependencies`
- `generate_project_health_report`

Every tool must have:
- Strict input schema.
- Output schema.
- Permission checks.
- Organization scoping.
- Validation.
- Audit logging.
- Error handling.

Separate read-only tools from mutation tools.

Sensitive operations must require appropriate human approval.

---

# 8. HOW THE AGENTS COLLABORATE THROUGH SWITCH

This must be implemented as genuine Switch collaboration.

Example:

A founder writes in Discord:

"We need to launch our new product in two weeks. Create a plan."

The flow:

1. Discord message reaches Switch.
2. Operations Manager receives the message.
3. Operations Manager retrieves organizational context using TEAMFORGE tools.
4. It asks the Project Manager Agent to create a proposed plan through a documented Switch handoff.
5. Project Manager retrieves existing employees, skills, workload and projects.
6. Project Manager proposes tasks and dependencies.
7. Memory Agent checks existing business knowledge.
8. Risk Agent identifies possible conflicts.
9. Operations Manager collects the findings.
10. Relevant human team members are invited into the workflow.
11. The team confirms proposed assignments.
12. Approved tasks are persisted by Node.js.
13. TEAMFORGE begins monitoring the project.

Do not simulate this by printing messages from multiple agents in one Node.js function.

Actual agents should participate through Switch.

If a provider or connector cannot support a specific collaboration capability, document that limitation and implement the closest genuine supported workflow.

---

# 9. AUTOMATIC CONVERSATION LISTENING

TEAMFORGE must be designed around normal conversation.

People should not need to type commands such as:

`/create-task`

or mention the AI every time.

The application should consume authorized conversation events through Switch.

Implement a message ingestion pipeline:

- Receive message event.
- Validate organization and room.
- Check source permissions.
- Identify sender.
- Deduplicate events.
- Store relevant source metadata.
- Provide the message to the appropriate Switch agent.
- Extract actionable context.
- Trigger specialist collaboration where necessary.
- Persist validated outcomes.
- Deliver a useful response.

Do not allow all six agents to respond to every message.

Configure:
- One primary Operations Manager.
- Specialist agents that participate when needed.
- Explicit handoffs.
- Response coordination.
- Duplicate response prevention.

If no-mention routing is not natively supported, implement a documented, reliable configuration or integration approach. Never claim that the feature works without testing it.

---

# 10. AUTOMATIC TASK AND COMMITMENT MANAGEMENT

TEAMFORGE should identify actionable information from ordinary conversation.

Example:

"I'll send the proposal to the client tomorrow."

Potential structured output:

- Action: Send proposal.
- Owner: Current speaker.
- Recipient: Client.
- Deadline: Tomorrow.
- Type: Commitment.
- Status: Proposed.
- Source: Original message.

The system should distinguish:
- Explicit assignments.
- Proposed assignments.
- Personal intentions.
- Commitments.
- Casual conversation.
- Questions.
- Hypothetical statements.

Do not turn every sentence into a task.

When the speaker says:

"Maybe we should redesign the dashboard."

That is an idea, not automatically an assigned task.

For ambiguous dates, ownership or identity, ask questions.

## Assignment logic

When a new task appears:

1. Identify the required skills.
2. Retrieve relevant employees.
3. Check confirmed skills.
4. Check current workload.
5. Check availability.
6. Check project responsibilities.
7. Recommend an owner.
8. Explain the recommendation.
9. Request approval when appropriate.
10. Record the assignment.

Do not silently assign work based on weak assumptions.

---

# 11. PROACTIVE INTELLIGENCE

TEAMFORGE must not only react to messages.

It should identify useful situations that require attention.

Implement a background worker that monitors:

- Upcoming deadlines.
- Overdue tasks.
- Unanswered status requests.
- Stalled tasks.
- Unresolved approvals.
- Broken dependencies.
- Project milestone risks.
- Unfulfilled commitments.
- Recurring business events.

Example:

Aarav's backend API task is overdue.

Neha's frontend task depends on it.

TEAMFORGE should:

1. Detect the overdue task.
2. Find dependent tasks.
3. Calculate the likely project impact.
4. Ask Aarav for an update.
5. Notify relevant affected people when appropriate.
6. Suggest alternative actions.
7. Escalate significant risks to the manager.

Use a persistent job scheduler, not in-memory timers.

Use timezone-aware scheduling.

Implement:
- One-time reminders.
- Recurring reminders.
- Deadline-based follow-ups.
- Snooze.
- Cancellation.
- Retry policies.
- Idempotent delivery.
- Quiet hours.
- Maximum notification frequency.
- User-configurable proactive messaging.

Proactive messages must be permission-based and relevant.

Do not spam employees.

Where possible, deliver proactive messages through Switch and its connected communication channels, using supported documented mechanisms.

---

# 12. HUMAN APPROVAL AND PERMISSION SYSTEM

This is essential for a real business product.

TEAMFORGE must support different organization roles.

Examples:
- Owner.
- Administrator.
- Manager.
- Team lead.
- Employee.
- External collaborator.

Support organization-scoped and room-scoped permissions.

Agents must only access information they are authorized to see.

Important actions should support approval workflows:

- Assigning people.
- Reassigning responsibilities.
- Changing important deadlines.
- Sending external communications.
- Modifying business-critical decisions.
- Accessing restricted information.

Create an approval workflow with:
- Requester.
- Requested action.
- Target resource.
- Reason.
- Approver.
- Status.
- Creation time.
- Resolution time.
- Audit history.

The AI must never treat its own recommendation as human approval.

Support explicit rejection and correction.

---

# 13. DYNAMIC BUSINESS SUPPORT

TEAMFORGE should not be tied to a specific organization structure.

Build flexible organization configuration.

An organization should be able to create:

- Custom departments.
- Custom teams.
- Custom roles.
- Custom skills.
- Custom entity types.
- Custom relationship types.
- Custom project categories.
- Custom task categories.
- Custom approval policies.
- Custom business workflows.
- Custom organizational terminology.

Use configurable metadata and schemas.

Do not write logic such as:

`if (department === "Engineering")`

as a requirement for core functionality.

The same system should support:
- A software startup.
- A marketing agency.
- A consulting firm.
- A manufacturing company.
- A sales organization.
- A nonprofit.
- A distributed remote team.

---

# 14. WEB DASHBOARD

Build a clean, professional React + TypeScript dashboard.

Use a modern design system.

Recommended:
- React.
- Vite.
- Tailwind CSS.
- shadcn/ui.
- Lucide icons.
- TanStack Query.
- React Router.

The UI should look like a polished business operations platform.

Avoid clutter, excessive gradients, unnecessary animations, and generic AI-themed designs.

## Required pages

### A. Overview dashboard

Show:
- Organization overview.
- Active projects.
- Tasks in progress.
- Overdue tasks.
- Upcoming deadlines.
- Pending approvals.
- Current risks.
- Recent decisions.
- Agent activity.

### B. People

Show:
- Employees.
- Roles.
- Skills.
- Departments.
- Teams.
- Current responsibilities.
- Active assignments.
- Workload.
- Reporting relationships.

Allow viewing an individual employee profile.

### C. Organization graph

Create an interactive knowledge graph.

Show relationships between:
- People.
- Teams.
- Projects.
- Tasks.
- Decisions.
- Clients.
- Other entities.

Allow users to click an entity and inspect its relationships and history.

### D. Projects

Show:
- Project status.
- Owners.
- Milestones.
- Tasks.
- Dependencies.
- Timeline.
- Risks.
- Decisions.
- Project activity.

### E. Tasks

Show:
- Assigned tasks.
- Unassigned tasks.
- Pending tasks.
- Completed tasks.
- Overdue tasks.
- Priorities.
- Deadlines.
- Dependencies.
- Owners.

Provide list and Kanban views.

### F. Organizational memory

Allow users to:
- Search memories.
- View facts.
- Inspect sources.
- View relationships.
- Inspect historical changes.
- Correct information.
- Merge duplicate entities.
- Request deletion where permitted.
- View disputed information.

### G. Approvals

Display pending approvals with:
- Action.
- Requester.
- Explanation.
- Impact.
- Approve and reject actions.

### H. Agent activity

Display:
- Agent identities.
- Roles.
- Recent room participation.
- Delegations.
- Handoffs.
- Tool actions.
- Errors.
- Task outcomes.

Show actual Switch activity where the integration makes it available. Do not fabricate agent collaboration logs.

### I. Settings

Include:
- Organization configuration.
- Roles and permissions.
- Switch connection status.
- Discord connection status.
- Agent configuration.
- Notification preferences.
- Integration settings.

---

# 15. IMPORTANT END-TO-END EXAMPLES

Implement these scenarios as testable workflows.

## Example 1: Automatic team understanding

A team member writes:

"Hi, I'm Aarav. I handle backend development and primarily work with Node.js and PostgreSQL."

TEAMFORGE:
- Identifies Aarav.
- Creates or updates his profile.
- Records his stated role.
- Records skills with their source.
- Links him to the organization.
- Makes the information retrievable by authorized agents.

Another person asks:

"Who knows PostgreSQL?"

TEAMFORGE identifies Aarav from organizational memory.

## Example 2: Automatic task extraction

Rahul writes:

"Priya, can you prepare the new landing page design before Wednesday?"

TEAMFORGE:
- Identifies Priya.
- Extracts the task.
- Extracts the deadline.
- Identifies the project from context.
- Proposes the assignment.
- Requests confirmation if necessary.
- Creates the task.
- Tracks it.

## Example 3: Changed responsibilities

The manager says:

"Priya is no longer handling the dashboard. Neha will take over."

TEAMFORGE:
- Identifies both people.
- Finds the existing assignment.
- Preserves the historical responsibility.
- Proposes the reassignment.
- Identifies affected dependencies.
- Requests required approval.
- Updates the active responsibility after approval.

## Example 4: Project blocker

Aarav writes:

"The API won't be ready until Thursday."

TEAMFORGE:
- Retrieves dependent tasks.
- Identifies Neha's frontend integration.
- Checks the launch deadline.
- Invokes the Risk Agent through Switch.
- Proposes a mitigation plan.
- Alerts affected teammates.
- Updates the approved project plan.

## Example 5: Meeting-to-execution

After a team meeting, TEAMFORGE extracts:
- Decisions.
- Tasks.
- Owners.
- Deadlines.
- Risks.
- Unresolved questions.

It presents a structured summary for confirmation and then persists the approved information.

## Example 6: Proactive project review

Every morning, TEAMFORGE checks:
- Today's deadlines.
- Overdue tasks.
- Unresolved blockers.
- Pending approvals.
- Dependencies.
- Project milestones.

It sends a concise contextual update to the appropriate room.

## Example 7: Organizational memory query

A founder asks:

"What did we decide about the pricing strategy last month, and what changed since then?"

TEAMFORGE retrieves:
- The original decision.
- The date.
- The people involved.
- The supporting conversation.
- Later changes.
- The currently active decision.

It presents an evidence-grounded answer.

---

# 16. EVENT-DRIVEN ARCHITECTURE

Implement an internal event system.

Examples:

- `message.received`
- `memory.proposed`
- `memory.updated`
- `entity.created`
- `entity.merged`
- `task.proposed`
- `task.created`
- `task.assigned`
- `task.completed`
- `task.overdue`
- `commitment.detected`
- `commitment.completed`
- `project.blocked`
- `approval.requested`
- `approval.approved`
- `deadline.changed`
- `risk.detected`
- `reminder.due`

Use typed events.

Events should trigger appropriate backend workflows.

For example:

`task.overdue`

can trigger:
- Dependency analysis.
- Risk Agent involvement through Switch.
- A status request.
- A manager notification.

Avoid tightly coupling all business modules.

Use an outbox or reliable event-publishing pattern for important database changes and external notifications.

Implement event deduplication and idempotency.

---

# 17. API DESIGN

Build REST APIs for the dashboard and internal integrations.

Example routes:

Organization:
- `GET /api/organizations/:id`
- `GET /api/organizations/:id/members`
- `POST /api/organizations/:id/members`

People:
- `GET /api/people`
- `GET /api/people/:id`
- `PATCH /api/people/:id`

Memory:
- `GET /api/memory/search`
- `GET /api/entities/:id`
- `GET /api/entities/:id/relationships`
- `GET /api/entities/:id/history`
- `POST /api/memory/proposals`
- `POST /api/memory/proposals/:id/approve`

Projects:
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`

Tasks:
- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `PATCH /api/tasks/:id`
- `POST /api/tasks/:id/assign`
- `POST /api/tasks/:id/complete`

Approvals:
- `GET /api/approvals`
- `POST /api/approvals/:id/approve`
- `POST /api/approvals/:id/reject`

Reminders:
- `GET /api/reminders`
- `POST /api/reminders`
- `PATCH /api/reminders/:id`
- `DELETE /api/reminders/:id`

Switch integration:
- Implement the documented protocol or integration endpoints actually required.
- Keep credentials secure.
- Verify inbound events.
- Handle retries.
- Record connection status.

Create OpenAPI documentation for the REST API.

---

# 18. SECURITY AND DATA GOVERNANCE

Treat this as a business application, not a toy.

Implement:
- Authentication.
- Organization isolation.
- Role-based access control.
- Room-level authorization.
- Tool-level permission checks.
- Secret management.
- Input validation.
- Audit logs.
- Source attribution.
- Safe memory updates.
- Rate limiting.
- Request validation.
- Secure error handling.

Never let one organization access another organization's data.

Never expose private employee conversations to other team members.

Never allow an agent to bypass backend authorization.

Treat retrieved conversation text, uploaded files and documents as untrusted data, not executable instructions.

Do not store secrets in source control.

Create `.env.example` with placeholders only.

---

# 19. DEMO MODE AND SAMPLE ORGANIZATION

A working demo must be available even if a live AI provider or Switch credentials are not configured.

Create a sample organization:

**Acme Technologies**

People:
- Rahul — Founder.
- Aarav — Backend Developer.
- Priya — UI/UX Designer.
- Neha — Frontend Developer.
- Karan — Marketing Manager.

Project:
- Website Launch.

Tasks:
- Landing page design.
- Backend integration.
- Frontend implementation.
- Marketing campaign.
- Final launch review.

Dependencies:
- Frontend integration depends on backend API availability.
- Final launch review depends on design and implementation.
- Marketing launch depends on website readiness.

Create realistic historical events and decisions.

The dashboard should show these records.

Include a clearly labeled demo mode that uses deterministic sample data and scripted workflows.

Do not present simulated agent collaboration as real Switch collaboration.

If live Switch is unavailable, label the simulation clearly.

---

# 20. PROJECT STRUCTURE

Use a clean modular monorepo.

Suggested layout:

teamforge/
  apps/
    api/
      src/
        config/
        middleware/
        routes/
        services/
        workers/
        events/
        integrations/
        mcp/
        server.ts

    web/
      src/
        components/
        pages/
        layouts/
        hooks/
        services/
        types/

  agents/
    operations-manager/
    project-manager/
    knowledge-memory/
    communication/
    research-strategy/
    quality-risk/

  packages/
    database/
    knowledge-graph/
    shared-types/
    event-system/
    permissions/

  switch/
    agent-instructions/
    room-configuration/
    integration-guides/

  prisma/
    schema.prisma
    migrations/
    seed.ts

  docs/
    ARCHITECTURE.md
    SWITCH_INTEGRATION.md
    MEMORY_ENGINE.md
    AGENT_ROLES.md
    API.md
    DEMO_GUIDE.md

  docker-compose.yml
  .env.example
  package.json
  README.md

Adjust the structure where technically appropriate, but maintain clear module boundaries.

---

# 21. TESTING REQUIREMENTS

Write tests for:

- Entity creation.
- Entity resolution.
- Duplicate detection.
- Relationship creation.
- Temporal fact updates.
- Memory provenance.
- Task extraction.
- Task assignment.
- Approval workflows.
- Deadline calculations.
- Dependency detection.
- Permission checks.
- Organization isolation.
- Reminder idempotency.
- Event deduplication.
- MCP tool execution.
- Switch connection and agent event handling.

Create an integration test for the following complete workflow:

1. A team member sends a message through a Switch-connected Discord room.
2. Operations Manager receives it.
3. It delegates to the Memory Agent or Project Manager through Switch.
4. The agent calls a real TEAMFORGE tool.
5. The backend stores a validated result.
6. A response is delivered through Switch.
7. The dashboard displays the updated information.

Clearly separate unit tests, integration tests, and demo-mode tests.

---

# 22. DEVELOPMENT PRIORITIES

Do not attempt to implement every feature at once.

Build in the following order.

## Phase 1: Foundation

- Initialize repository.
- Set up TypeScript.
- Set up PostgreSQL and migrations.
- Set up backend.
- Set up frontend.
- Create organization and people models.
- Create basic task and project models.
- Build a health-check endpoint.

## Phase 2: Switch integration

This is critical.

- Read actual Switch documentation.
- Install or connect to Switch.
- Connect Discord.
- Create a shared room.
- Connect one real Operations Manager agent.
- Verify message delivery.
- Verify agent responses.
- Verify room permissions.
- Verify a real handoff.

Do not proceed under the assumption that integration works. Test it.

## Phase 3: Business tools

- Implement Node.js business services.
- Expose MCP tools or the appropriate documented agent tools.
- Connect the Operations Manager to the tools.
- Test real database reads and writes.

## Phase 4: Memory engine

- Entities.
- Relationships.
- Facts.
- Events.
- Sources.
- Entity resolution.
- Temporal updates.
- Memory proposals.
- Retrieval.

## Phase 5: Specialist collaboration

- Add Project Manager.
- Add Memory Agent.
- Add Communication Agent.
- Add Risk Agent.
- Add Research Agent.
- Test real Switch delegation.

## Phase 6: Proactive workflows

- Persistent scheduler.
- Reminders.
- Deadline checks.
- Overdue task detection.
- Dependency alerts.
- Proactive follow-ups.

## Phase 7: Dashboard and polish

- Organization overview.
- People.
- Projects.
- Tasks.
- Knowledge graph.
- Approvals.
- Agent activity.
- Settings.

Prioritize functionality and a polished demonstration over excessive features.

---

# 23. DEFINITION OF DONE FOR THE FIRST VERSION

The first version is not complete just because the dashboard looks good.

The following must actually work:

1. TEAMFORGE starts locally with documented setup instructions.
2. PostgreSQL persists organizational data.
3. Switch can be connected using the documented integration.
4. Discord messages can reach a Switch room.
5. At least one real TEAMFORGE agent participates through Switch.
6. At least one real agent-to-agent handoff works through Switch.
7. Agents can call our actual Node.js business tools.
8. TEAMFORGE can create and retrieve employee profiles.
9. TEAMFORGE can extract and store organizational facts.
10. TEAMFORGE can link entities and relationships.
11. TEAMFORGE can create and retrieve tasks.
12. TEAMFORGE can identify task dependencies.
13. TEAMFORGE can request human approval.
14. TEAMFORGE can schedule and deliver at least one reminder.
15. The dashboard displays persisted records.
16. Memory changes preserve historical records.
17. Organization permissions are enforced.
18. The README explains exactly how to run the system.

If a feature cannot be completed, document it honestly and prioritize the working core.

---

# 24. DEVELOPMENT INSTRUCTIONS TO YOU, OPENCODE

Follow these instructions strictly.

You are not being asked to produce a design document and stop.

You are being asked to BUILD the application.

Start by inspecting the current repository and available environment.

Then:

1. Inspect Switch documentation and repository.
2. Produce a concise technical architecture.
3. Create the project structure.
4. Implement the database.
5. Implement the backend.
6. Implement the Switch integration.
7. Build the first agent.
8. Expose real business tools.
9. Implement a complete end-to-end workflow.
10. Build the dashboard.
11. Add the remaining agents incrementally.
12. Test everything.
13. Document the setup.

Do not ask me to manually implement code that you can implement yourself.

Do not stop after creating empty files or placeholder components.

Do not produce pseudocode where working code is required.

Do not claim an integration works without actually testing it.

Do not fabricate API responses.

Do not silently replace a real Switch integration with a mock.

If credentials are unavailable:
- Implement the integration against documented interfaces.
- Create an `.env.example`.
- Clearly state which credentials are required.
- Provide a testable setup path.
- Keep demo mode separate from live mode.

When making architectural decisions, favor:
- Simplicity.
- Modularity.
- Security.
- Extensibility.
- Real agent collaboration.
- Dynamic organizational intelligence.

Avoid unnecessary complexity and premature microservices.

Do not over-engineer the first release.

## Final expected outcome

A working TEAMFORGE application in which:

A team talks naturally in Discord.

Switch connects humans and AI teammates in shared collaboration rooms.

The Operations Manager understands the conversation and delegates work to specialists.

Specialist agents use our Node.js tools to retrieve organizational knowledge, create tasks, update approved records, and identify risks.

The memory engine continuously builds an interconnected understanding of the organization.

The system follows up on commitments, detects blockers, schedules reminders, and proactively helps people complete work.

The dashboard provides visibility into the organization and its operations.

**The final product must demonstrate humans and AI agents collaborating through Switch to complete a genuine business workflow.**

Build this as a serious, extensible first version of TEAMFORGE.

Let's get it working.