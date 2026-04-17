# Requirements Document

## Introduction

The Content Diff feature adds a new `/content-diff` page to HAR Analyzer. Its purpose is to let users compare the response body contents of the same URL across different HAR files or multiple requests within the same file. Users can search for a URL, select any two entries to compare, and see exactly whether the bodies are identical or how they differ — using either a unified or side-by-side diff view. This complements the existing `/compare` page, which shows per-file summaries but provides no body diffing capability.

## Glossary

- **Content_Diff_Page**: The new `/content-diff` page introduced by this feature.
- **Entry**: A single HTTP request/response record (`EntryRecord`) stored in the HAR store, identified by URL, HAR file name, file index, and `startedDateTime`.
- **Response_Body**: The `responseContent` field on an `EntryRecord` — the raw text of the HTTP response body. May be `undefined` when the HAR exporter did not capture body content.
- **Diff_View**: A visual representation of line-by-line differences between two Response_Bodies, with intra-line character-level highlighting of changed words/characters within modified lines. Supports two modes: unified and side-by-side.
- **Unified_Diff**: A single-panel diff layout showing removed lines prefixed with `-` and added lines prefixed with `+`, with character-level highlighting within changed lines.
- **Side_By_Side_Diff**: A two-column diff layout showing the left (baseline) entry alongside the right (comparison) entry with changed lines highlighted in each column, including character-level highlighting within changed lines.
- **Intra_Line_Diff**: Character- or word-level highlighting within a changed line, showing the exact characters that were added or removed on that line.
- **JSON_Prettify**: Automatic pretty-printing of response bodies whose content type is `application/json` or ends in `+json` before diffing and display, so structural changes are easier to read.
- **Baseline_Entry**: The left-hand entry chosen by the user as the reference point for a diff.
- **Comparison_Entry**: The right-hand entry chosen by the user to compare against the Baseline_Entry.
- **Binary_Entry**: An Entry whose content type is a non-text MIME type (e.g. image/*, font/*, audio/*, video/*, application/octet-stream) or whose Response_Body is `undefined`.
- **HAR_Store**: The in-memory and IndexedDB-backed store of all loaded HAR data, accessed via `useHarStore()`.
- **URL_Search_Input**: The text input on the Content_Diff_Page through which users filter and select a URL to inspect.

---

## Requirements

### Requirement 1: URL Search and Selection

**User Story:** As a developer, I want to type or paste a URL into a search input and see a filtered list of matching URLs from the loaded HAR data, so that I can quickly navigate to the entries I want to compare.

#### Acceptance Criteria

1. THE Content_Diff_Page SHALL display a URL_Search_Input that accepts free-text entry.
2. WHEN the user types in the URL_Search_Input, THE Content_Diff_Page SHALL display a filtered list of candidate URLs from the HAR_Store whose URL strings contain the typed substring (case-insensitive).
3. WHEN the user clears the URL_Search_Input, THE Content_Diff_Page SHALL hide the candidate list and show no selected URL.
4. WHEN the user selects a URL from the candidate list, THE Content_Diff_Page SHALL set that URL as the active URL and load all Entries for it.
5. IF no HAR files are loaded, THEN THE Content_Diff_Page SHALL display a message directing the user to upload HAR files and SHALL NOT render the URL_Search_Input.
6. IF the URL_Search_Input contains text that matches no URL in the HAR_Store, THEN THE Content_Diff_Page SHALL display a "no matching URLs" message in the candidate list.
7. THE Content_Diff_Page SHALL be navigable from the existing `/compare` page via a link labelled "Content Diff" shown alongside the URL being compared.

---

### Requirement 2: Entry Listing and Metadata Display

**User Story:** As a developer, I want to see all entries for the selected URL, along with their HAR file name and key metadata, so that I know which entries I am choosing between before running a diff.

#### Acceptance Criteria

1. WHEN a URL is selected, THE Content_Diff_Page SHALL display a list of all Entries for that URL, one row per Entry, with no grouping or deduplication — each recorded request appears as its own selectable entry regardless of which HAR file it came from.
2. WHEN a single HAR file contains multiple requests to the same URL, THE Content_Diff_Page SHALL display each of those requests as a separate entry row, distinguishable by their `startedDateTime` timestamp.
2. THE Content_Diff_Page SHALL display the following metadata for each Entry row: HAR file name, HTTP status code, content type, response body size (in human-readable bytes), and `startedDateTime` formatted as UTC.
3. THE Content_Diff_Page SHALL visually distinguish Binary_Entries from text Entries in the entry list (e.g. a "binary / no content" badge).
4. WHEN a URL has only one Entry, THE Content_Diff_Page SHALL display that Entry's metadata and Response_Body and SHALL display an informational message stating that only one entry is available and no diff can be computed.
5. THE Content_Diff_Page SHALL display the full selected URL in a dedicated, visually prominent area above the entry list.

---

### Requirement 3: Entry Selection for Diff

**User Story:** As a developer, I want to choose any two entries from the list to compare, so that I can diff responses from different files, timestamps, or requests as needed.

#### Acceptance Criteria

1. THE Content_Diff_Page SHALL provide a selection mechanism allowing the user to designate one Entry as the Baseline_Entry and one Entry as the Comparison_Entry.
2. WHEN the user selects the same Entry as both Baseline_Entry and Comparison_Entry, THE Content_Diff_Page SHALL display a validation message and SHALL NOT render the Diff_View.
3. WHEN both Baseline_Entry and Comparison_Entry are selected and are different Entries, THE Content_Diff_Page SHALL automatically render the Diff_View without requiring an additional confirmation action.
4. THE Content_Diff_Page SHALL label the Baseline_Entry selection as "Baseline" and the Comparison_Entry selection as "Compare".
5. WHEN a new URL is selected via the URL_Search_Input, THE Content_Diff_Page SHALL reset both Entry selections.

---

### Requirement 4: Identical Content Indication

**User Story:** As a developer, I want to know immediately whether two entries have identical response bodies, so that I can quickly confirm consistency without reading through the full content.

#### Acceptance Criteria

1. WHEN the Baseline_Entry and Comparison_Entry have identical Response_Bodies (exact string match), THE Content_Diff_Page SHALL display a prominent "Identical" badge or banner.
2. WHEN the Response_Bodies are identical, THE Content_Diff_Page SHALL still display both Response_Bodies in the Diff_View (with the "Identical" indicator) so the user can read the content.
3. WHEN the Response_Bodies are not identical, THE Content_Diff_Page SHALL NOT display an "Identical" indicator.

---

### Requirement 5: Diff View — Unified and Side-by-Side Modes

**User Story:** As a developer, I want to toggle between a unified diff and a side-by-side diff view, so that I can choose the layout that best suits the content I am reviewing.

#### Acceptance Criteria

1. THE Content_Diff_Page SHALL provide a toggle control allowing the user to switch between Unified_Diff mode and Side_By_Side_Diff mode.
2. WHEN in Unified_Diff mode, THE Content_Diff_Page SHALL render a single scrollable panel showing all lines; removed lines (present in Baseline only) SHALL be highlighted in red with a `-` prefix, and added lines (present in Comparison only) SHALL be highlighted in green with a `+` prefix; unchanged lines SHALL be shown without color highlighting.
3. WHEN in Side_By_Side_Diff mode, THE Content_Diff_Page SHALL render two panels side by side — left panel for the Baseline_Entry and right panel for the Comparison_Entry — with changed lines highlighted in each respective panel.
4. WHEN the user toggles the diff mode, THE Content_Diff_Page SHALL preserve the current Baseline_Entry and Comparison_Entry selections.
5. THE Content_Diff_Page SHALL display line numbers alongside content in both diff modes.
6. THE Content_Diff_Page SHALL default to Unified_Diff mode on initial page load.
7. THE Content_Diff_Page SHALL perform all diff computation client-side without any network requests.
8. WHEN a line is modified (present in both Baseline and Comparison but with different content), THE Content_Diff_Page SHALL apply Intra_Line_Diff highlighting to show the specific characters or words that changed within that line, in both Unified_Diff and Side_By_Side_Diff modes.
9. WHEN a Response_Body's content type is `application/json` or ends with `+json`, THE Content_Diff_Page SHALL attempt to JSON_Prettify the body (parse and re-serialize with 2-space indentation) before diffing and display. IF the body is not valid JSON, THE Content_Diff_Page SHALL fall back to displaying and diffing the raw body without error.
10. WHEN JSON_Prettify is applied, THE Content_Diff_Page SHALL display a label indicating the content has been pretty-printed.

---

### Requirement 6: Binary and Missing Content Handling

**User Story:** As a developer, I want clear feedback when a response body is unavailable or binary, so that I understand why a diff cannot be shown and can still compare sizes.

#### Acceptance Criteria

1. WHEN either the Baseline_Entry or the Comparison_Entry is a Binary_Entry, THE Content_Diff_Page SHALL NOT render a Diff_View.
2. WHEN either selected Entry is a Binary_Entry, THE Content_Diff_Page SHALL display a message explaining that body diffing is unavailable for binary or uncaptured content.
3. WHEN either selected Entry is a Binary_Entry, THE Content_Diff_Page SHALL display a size comparison showing the `contentSize` of both entries in human-readable bytes, so the user can compare sizes.
4. WHEN both selected Entries are text Entries but one or both have an empty Response_Body (empty string), THE Content_Diff_Page SHALL treat the empty string as the body content and SHALL render the Diff_View normally.

---

### Requirement 7: Large Payload Truncation

**User Story:** As a developer, I want large response bodies to be truncated by default so the page remains responsive, with an option to reveal the full content.

#### Acceptance Criteria

1. WHEN a Response_Body exceeds 50,000 characters, THE Content_Diff_Page SHALL truncate the displayed content at 50,000 characters and display a notice stating the body has been truncated and showing the full character count.
2. WHEN a truncated Response_Body is displayed, THE Content_Diff_Page SHALL provide a "Show full content" control that, when activated, reveals the complete Response_Body in the Diff_View.
3. WHEN the "Show full content" control is activated, THE Content_Diff_Page SHALL replace the truncation notice with a "Show less" control that restores the truncated view.
4. THE Content_Diff_Page SHALL apply the truncation threshold independently to each entry — Baseline_Entry and Comparison_Entry are each truncated based on their own body length.

---

### Requirement 8: Navigation Integration

**User Story:** As a developer, I want to reach the Content Diff page from the existing compare page, so that I can go from a per-file summary directly into a body diff without having to navigate back to the home page.

#### Acceptance Criteria

1. THE Compare_Page (`/compare?url={encoded}`) SHALL display a link or button labelled "Content Diff" that navigates to `/content-diff?url={encoded}` pre-populating the URL_Search_Input with the current URL.
2. WHEN the Content_Diff_Page is loaded with a `url` query parameter, THE Content_Diff_Page SHALL pre-select that URL and load its Entries automatically.
3. WHEN the Content_Diff_Page is loaded with a `url` query parameter that does not exist in the HAR_Store, THE Content_Diff_Page SHALL display a "URL not found in loaded HAR data" message.
