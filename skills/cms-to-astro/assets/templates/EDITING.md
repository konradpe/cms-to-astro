# Changing your website

Your website is a set of files in a git repository ({{repo URL}}). You don't edit them yourself: you tell a coding agent what you want, it makes the change, checks it and publishes it.

## Getting started

1. Open a terminal in the website folder ({{path}}), or open the folder in {{Claude Code desktop / your editor}}.
2. Start the agent: `claude`
3. Say what you want, in your own words.

## Example requests

- "Add a news post 'Summer break' dated today: We're closed from 1 to 15 August. Use the photo summer.jpg from my Downloads folder."
- "Change the phone number to +43 1 234 56 78 everywhere."
- "On the About page, replace the second paragraph with: …"
- "Add the project 'Haus am See' with these three photos and this text: …"
- "Hide the job offer on the Team page for now."
- "The page /services/ should be called /offer/ from now on."

Be specific about *where* (page name or address) and *what* (exact text, which photo). If you're unsure, describe it; the agent will ask.

## What happens next

{{Preview first:}} The agent shows you a preview link. Check the page on your computer and phone. If it's right, say "publish". A minute or two later it is live.

{{Direct:}} The agent publishes right away; after a minute or two the change is live. Check it on {{domain}}.

## If something went wrong

Say "undo the last change" (or describe which change). Every version of the site is kept, so nothing is ever lost.

## Things to ask before doing

- Adding a new kind of page, a form, a shop, a map, a video or social media widgets: these may need a service or a privacy-policy update. Ask the agent what it would involve first.
- Changing colours, fonts or layout: possible, but it's a design change, not an edit. Say so explicitly.

## Help

Technical contact: {{name, e-mail}}
Hosting: {{host}} (account: {{e-mail}})
Domain: {{registrar}}
