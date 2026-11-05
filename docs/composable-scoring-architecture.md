# Deferred Composable Scoring Architecture

The current application exposes registered `round-sum`, `final-total`, `winner-only`, and `mario-kart-8` engines. Round and final-total templates support named numeric categories, and round entries support safe arithmetic expressions. A future scoring engine may go further by describing a scoresheet as ordered reusable sections without allowing user-authored JavaScript.

Each section would have a stable ID, a type, display metadata, validation rules, and a calculation configuration. Candidate section types are numeric categories, repeated numeric sections, bonuses or penalties, and lookup tables. An engine would validate the full definition, render each section, own its raw entry data, and calculate totals deterministically.

For Ticket to Ride, a definition could combine a repeated route-scoring section backed by a route-length lookup table, a numeric destination-ticket section, and a longest-route bonus. Participant totals would sum the section results. Definitions and sessions would both be versioned, and a session would snapshot the resolved calculation configuration so later template edits cannot change historical results.

This is architectural direction only. The current UI does not offer user-defined composable section schemas, repeated section definitions, lookup tables, custom scripting, player limits, or template branding.
