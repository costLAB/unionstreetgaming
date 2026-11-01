# Union Street Gaming

The site for unionstreetgaming.com: a game selector that links to our games (pesto.world, saberside.netlify.app).
Plain static HTML, CSS, and JS with no build step. Keep it that way unless a PR makes the case for one.

## Style

- Simple and quiet like Render's UI, with Dracula typography: Fira Code, and code-styled headings and labels.
- Colors are tokens on `:root` in `style.css`: Dracula in dark mode, Alucard in light mode. The page follows the
  system theme, and the toggle overrides it. Every change must look right in both.
- It must work at phone width (no horizontal scroll) as well as on desktop.

## Branches and pull requests

`main` is the default branch and stays named `main`. All work merges into it through a PR.

Name every branch and PR for **why** the work exists (what it's for), not for the files or parts it touches.

- **Branch:** `<kind>/<purpose>`, lowercase kebab-case, two to five words.
  - `feature/`: something visitors can see or do
  - `fix/`: a bug fix
  - `foundation/`: structure or tooling that visitors don't see
  - `docs/`: docs only
  - Good: `feature/playable-pumpkin-mascot`, `fix/light-mode-contrast`. Bad: `update-css`, `claude/xyz`.
- **PR title:** the same purpose in plain words, sentence case, with no prefix. For example, "Let visitors play
  with a pumpkin mascot" or "Make the light theme readable".
- **PR description:** start with why the change matters, then what changed and how it was checked (screenshots of
  both themes for visual changes).
- One purpose per branch and PR.
