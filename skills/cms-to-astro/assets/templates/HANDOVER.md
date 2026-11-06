# Handover: {{domain}} migration

Written {{YYYY-MM-DD HH:MM}} at the end of a working session, so that the next session (or another agent) can continue without reconstructing anything. Keep it short; details live in MIGRATION.md and PLAN.md.

## Where we are

- Stage: {{N · name}} ({{done / in progress}})
- Pages: {{X of Y designed, Z as wireframes, W not started}} (PLAN.md)
- Last local checkpoint: {{git commit hash and message, if git is set up}}

## Done in this session

- {{…}}

## Unfinished (exact state)

- {{what was started but not finished, which files are half-done, what the last command was}}

## Next steps, in order

1. {{…}}
2. {{…}}
3. {{…}}

## Waiting for the owner

- {{question}} (asked {{date}})

## Getting going again

```bash
cd {{project path}}
{{nvm use / export PATH=… for the Node version in .nvmrc}}
npm install                                   # only if node_modules is missing
node {{skill-dir}}/scripts/plan.mjs report    # current status → PLAN.md
npm run build && npm run preview -- --host    # look at the current state
```

## Resume prompt

Paste this into a new session (any agent with this skill):

> Continue the website migration in `{{project path}}`. Read HANDOVER.md, then MIGRATION.md and PLAN.md, and continue with "Next steps". Ask me before anything that leaves this computer.
