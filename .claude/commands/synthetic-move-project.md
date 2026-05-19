---
description: Move a synthetic-data project to a folder (matching both by name)
argument-hint: <project-name> <folder-name>
---

Move project `$1` into folder `$2`.

Steps:

1. Call `list_projects` MCP tool. Find the project whose name matches `$1` case-insensitively. If multiple match, list candidates with their IDs and ask the user to disambiguate. If none match, abort with an error.

2. Call `list_groups`. Find the group whose name matches `$2` case-insensitively.

3. If the group does not exist, call `create_group({name:"$2", icon:"📁"})` and use the returned `groupId`.

4. Call `move_project_to_group({projectId, groupId})`.

5. Print a single confirmation line: `Moved <projectName> -> <folderName>`.
