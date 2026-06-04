# UI/UX Codebase Audit Report

## 1. UI Consistency & The "Rogue Token" Problem
**Status**: Critical Fragmentation
**Description**: The codebase attempts to use a CSS variable design system (`uiShell.css` defines `--shell-primary`, `--shell-bg`, etc.), but these tokens are almost completely ignored in component-level stylesheets. 

**Specific Offenders:**
- **File:** `public/css/teacherDashboard.css`
- **Lines:** 55, 87, 98, 116, 218 (`#2563eb` used instead of `var(--shell-primary)`)
- **Lines:** 14, 73, 776 (`#0f172a` used instead of `var(--shell-text)`)
- **Lines:** 137, 166, 186 (`#e2e8f0` used instead of `var(--shell-border)`)

**Impact**: If you ever want to rebrand the application (e.g., change the primary blue to a different color or implement Dark Mode), you would have to manually "find and replace" thousands of hardcoded hex codes across 11 different CSS files. Spacing (margins/padding) is also hardcoded in raw pixels instead of using a baseline spacing scale (e.g., using a base of `4px` or `8px` variables).

---

## 2. Responsiveness & Container Overflow
**Status**: High Priority
**Description**: While the outer shell (`uiShell.css`) handles mobile sidebar collapsing well, the inner content panels lack proper media queries, causing severe squeezing and horizontal scrolling on mobile and tablet breakpoints.

**Specific Offenders:**
- **File:** `public/css/teacherDashboard.css` (Line 128)
  - `.stats-row` uses `grid-template-columns: repeat(3, minmax(0, 1fr));`. Without a `@media (max-width: 768px)` rule changing this to `1fr`, the three stat boxes will crush horizontally on mobile devices.
- **File:** `public/css/teacherDashboard.css` (Line 158)
  - `.content-area` uses `grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.85fr);`. This will completely break on iPad portrait and mobile devices because it forces two columns unconditionally. 

---

## 3. UX Patterns & Accessibility
**Status**: Medium Priority
**Description**: While some `aria-label` tags are present in the EJS templates, there are accessibility and interaction gaps in the styling layer.

**Specific Offenders:**
- **Missing Focus States:** In `teacherDashboard.css`, `.start-btn` (Line 217) and `.end-btn` (Line 609) have `:hover` and `:active` states, but they completely lack `:focus-visible` or `:focus` states. Keyboard navigators (users pressing Tab) will not know which button they are focused on.
- **Low Contrast Text:** `.alert-box.success` (Line 121) uses `#15803d` on `#dcfce7`. While passable, `.panel-subtitle` (Line 179) uses `#6b7280` on white, which borders on failing WCAG AA contrast ratios for small text.
- **Layout Shift:** In `uiShell.css` (Line 95), `.attendify-sync-toast` uses an animation that relies on `transform`. This is good, but if any elements use `margin-top` dynamically via JS, it will cause Cumulative Layout Shift (CLS).

---

## 4. Recommended Design Contract

Moving forward, the frontend architecture should enforce the following rules:

1. **Zero Hardcoded Hex Codes**: 
   - All colors *must* use CSS variables defined in `:root`. If a new shade is needed (e.g., `#6b7280`), add it to `:root` as `--shell-gray-500` and reference it everywhere.
2. **Fluid Grids via Auto-Fit or Media Queries**:
   - Never use fixed column grids like `repeat(3, 1fr)` without a fallback. 
   - *Rule:* Use `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));` so the browser automatically stacks columns on small screens without needing manual media queries.
3. **Accessibility First (A11y)**:
   - Every interactive element (`button`, `a`, `input`) must have a clearly defined `:focus-visible` state in CSS.
   - Any icon-only button (like the sidebar toggles) must have an explicit `aria-label`.
4. **Spacing Tokens**:
   - Stop using arbitrary pixel values (`padding: 22px;`, `margin: 18px;`). Create CSS variables for spacing (`--space-sm: 8px`, `--space-md: 16px`, `--space-lg: 24px`) to enforce visual rhythm.
