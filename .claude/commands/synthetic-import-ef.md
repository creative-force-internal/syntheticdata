---
description: Import a C# Entity Framework DbContext directory as a new project
argument-hint: <path-to-DbContext-dir> [folder-name]
allowed-tools: Glob, Read, Bash
---

Import the C# Entity Framework Core schema at `$1` as a new syntheticdata project. Optional folder name: `$2`.

Steps:

1. **Read source files** — Use Glob to list all `*.cs` files at the TOP LEVEL of `$1` (skip subdirectories like `Custom/`, `Enums/`, `QueryModel/`). Read each file. Build a `files[]` array of `{filename, content}`.

2. **Determine project name** — Identify the DbContext class (filename ending in `Context.cs` with class extending `DbContext`). Use that class name as the project name.

3. **Resolve folder** —
   - If `$2` is provided: call `list_groups` MCP tool; find a group whose name matches `$2` case-insensitively. If none exists, call `create_group({name:"$2", icon:"📦"})` and use the returned `groupId`.
   - If `$2` is empty: pass `groupId: null` (project lands in Uncategorized).

4. **Create the project** — Call `infer_project_from_csharp_ef({name, files, groupId})`.

5. **Report** — Print: project name, projectId, tableCount, FK count (count columns where `generatorConfig.poolRef` is set, via `get_project`), and the first 5 warnings (if any).
