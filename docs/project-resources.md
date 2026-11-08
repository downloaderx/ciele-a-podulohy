# Project resources

Relationship and personal project roots have an optional `resources` array. Links,
document links and text notes stay in the board JSON and its existing backup flows.
Removal uses `deletedAt`; the project editor can restore removed resources.
The server retains resources omitted by older clients.

Uploaded files are limited to 3 MB and common document/image/text extensions.
`POST /api/project-files` checks authentication, request origin, expected profile
and project write access. On first use it creates the private
`foxies-project-files` Supabase Storage bucket using the existing service key.
Public buckets are rejected. File content is stored separately from board JSON.
Each file is immutable; its metadata is attached using the board's backup and CAS
write flow. Files are retained so historical board backups can reference them.

`GET /api/project-files?goalId=...&resourceId=...` authenticates the reader, locates
the live resource and binds its storage key to the goal/resource IDs. It serves
the file as a download with no-store and nosniff headers. Personal resources have
the same mutually-readable/owner-editable policy as personal projects.

A local PC path is optional reference text, not a file:// link. The UI copies it
for use in File Explorer and separately offers the uploaded snapshot. It does not
open local desktop programs, monitor the original, or automatically refresh the
backup when the original changes.

JSON exports contain file metadata, local paths, links and notes, but not binary
file contents. Uploaded files remain in the project's Supabase Storage bucket;
restoring to another Supabase project also requires transferring those objects.
