# DXRating Context

DXRating is a maimai DX rating calculator and community platform. This context captures the project-specific language used when discussing song data, rating calculation, and score imports.

## Language

**Sheet Identity**:
The stable identity of one playable chart, formed from song id, sheet type, and difficulty.
_Avoid_: chart key, canonical string

**Provider Sheet Reference**:
An explicit external reference to one playable chart, such as title/type/difficulty, internal id/type/difficulty, or provider music id plus difficulty.
_Avoid_: fuzzy match, lookup key

**Song Catalog**:
The generated maimai DX song and sheet data used by the app to resolve playable charts.
_Avoid_: dxdata blob, song JSON

**Versioned Sheet**:
A sheet viewed under a selected maimai DX version, including version-specific internal level rules.
_Avoid_: flattened sheet

**Rating Entry**:
A user's achievement on one sheet, including achievement rate and optional combo or sync flags.
_Avoid_: score row, play record

**Best 50**:
The maimai DX rating set made from the best current-version entries and older-version entries.
_Avoid_: b50 calculation, rating list

**Best 50 Bucket**:
The current-version or older-version side of a Best 50 set.
_Avoid_: includedIn, rating eligibility

**Oneshot Image**:
A rendered share image for a player's Best 50 entries.
_Avoid_: renderer output, rating card

**Rating Import**:
The process of converting an external provider's score data into Rating Entries.
_Avoid_: import handler, provider fetch

**Import Warning**:
A non-fatal issue found during a Rating Import, such as an external score that cannot be matched to the Song Catalog.
_Avoid_: skipped row, soft error

**Import Provider**:
An external source of score data, such as LXNS, MaimaiNET, Diving Fish, AquaDX, MuNET, or Aqua SQLite.
_Avoid_: importer, source integration

## Relationships

- A **Song Catalog** contains many **Versioned Sheets**.
- A **Song Catalog** resolves **Provider Sheet References** to **Sheet Identities**.
- A **Versioned Sheet** has exactly one **Sheet Identity**.
- A **Rating Entry** belongs to exactly one **Sheet Identity**.
- A **Rating Entry** may include its **Import Provider** and provider-supplied **Best 50 Bucket**.
- A **Best 50** is selected from many **Rating Entries**.
- A **Best 50** has current-version and older-version **Best 50 Buckets**.
- An **Oneshot Image** is rendered from a **Best 50**.
- A **Rating Import** reads from one **Import Provider** and produces zero or more **Rating Entries**.
- A **Rating Import** may also produce Import Warnings without failing the import.
- A **Rating Import** keeps the highest-achievement **Rating Entry** when an **Import Provider** reports multiple rows for the same **Sheet Identity**.

## Example Dialogue

> **Dev:** "When a **Rating Import** sees a Diving Fish row, should it create a **Rating Entry** immediately?"
> **Domain expert:** "Only after the row is matched to a **Sheet Identity** in the **Song Catalog**."

## Flagged Ambiguities

- "sheet" and "chart" are both used informally; resolved: use **Versioned Sheet** when version-specific data matters, and **Sheet Identity** when matching records across providers.
