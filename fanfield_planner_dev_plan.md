# Fanfield Planner Plugin Development Plan

This document outlines the development plan for the "Fanfield Planner" IITC plugin, which implements the "Single-point Pincushion" / "Fanfield" strategy.

## Core Idea
The plugin will guide the user through planning a multi-layered control field strategy based on selecting one "Anchor" portal and multiple "Base" portals. It involves two main phases: building a base structure and then leveraging a "destroy and rebuild" action on the anchor to maximize fields.

## Development Roadmap

### Phase 0: Project Setup (Completed)

1.  **Create Plugin Files:**
    *   Directory: `local-plugins/fanfield-planner/`
    *   Files: `fanfield-planner.user.js` and `fanfield-planner.meta.js`
    *   Basic UserScript headers adapted with user's specific details (`@id`, `@name`, `@author`, `@namespace`, `@updateURL`, `@downloadURL`, `@version`, `@description`).
    *   Basic `wrapper` and `setup` function structures in `user.js`.

### Phase 1: User Interface (UI) Design & Implementation (Completed)

1.  **Dialog Box (`self.dialog_html`):**
    *   **Portal Selection Area:**
        *   A distinct section for the single "Anchor" portal (display name, image, GUID).
        *   A dynamic list area for the multiple "Base" portals (display name, image, GUID for each).
        *   **Mode Selection:** Radio buttons or similar controls to switch between "Select Anchor" and "Select Base Portals" when clicking on the map.
    *   **Options Area:**
        *   **Path Optimization Mode:** (For base-linkup path, e.g., "Shortest Travel Distance", "Optimize for Keys" - can be simplified initially).
        *   **Phase 2 Strategy:** (e.g., "Link to all base portals" - can be a simple checkbox for initial implementation).
    *   **Action Buttons:**
        *   `Plan Fanfield`: Initiates the planning process.
        *   `Clear All Portals`: Resets all selected anchor and base portals.
        *   `Export to DrawTools`: (Standard IITC integration).
    *   **Output Area:** A read-only `<textarea>` for displaying the step-by-step plan.

2.  **Portal Preview & Feedback:**
    *   Display images and names of selected Anchor and Base portals within the dialog.
    *   Provide visual cues (e.g., messages) to guide the user on what to select next.

### Phase 2: Core Logic Implementation

1.  **Portal Selection Handling (`self.portalSelected`):**
    *   Modify the standard `portalSelected` hook to update `self.anchorPortal` or `self.basePortals` based on the active UI mode.
    *   Ensure proper handling of adding/removing base portals (e.g., if re-selecting an already selected base portal).

2.  **Main Planning Function (`self.generateFanfieldPlan`):** This function will be the orchestrator.

    *   **Validation:** Check if an anchor and at least two base portals are selected.
    *   **Step 2a: Path Optimization for Base Portals (Phase 1 Travel):**
        *   **Objective:** Find the optimal travel path to visit all `self.basePortals` to build the initial fan structure efficiently.
        *   **Algorithm:** Adapt the `findShortestPath` logic from the `homogeneous-fields` plugin (which uses a local search/simulated annealing-like approach for TSP) to order the `self.basePortals`.
        *   **Output:** An ordered list of base portal GUIDs to visit.

    *   **Step 2b: Generate Phase 1 Plan (Base Construction):**
        *   Iterate through the ordered base portals.
        *   For each base portal:
            *   Add an "Action: Capture/Visit Portal" for the current base portal.
            *   Add an "Action: Link to Anchor" (from current base portal to `self.anchorPortal`).
            *   Add "Action: Link to previously visited Base portals" (from current base portal to all base portals visited *before* it in the ordered path, to form fields).

    *   **Step 2c: Generate Phase 2 Plan (The Grand Finale):**
        *   Add an "Action: Go to Anchor Portal" step.
        *   Add a **"Action: Destroy and Recapture Anchor Portal"** (new action type).
        *   Add "Action: Link from Anchor to all Base Portals" (from `self.anchorPortal` to each portal in `self.basePortals`).

### Phase 3: Output and Visualisation

1.  **Text Plan Generation (`self.planToText`):**
    *   Create a function to format the entire multi-phase plan (including "Destroy" actions) into a clear, numbered/lettered step-by-step text format suitable for the `textarea`.
    *   **Calculations:** Include summary statistics:
        *   Total number of portals involved.
        *   Total links created (Phase 1 + Phase 2).
        *   Total fields created (Phase 1 + Phase 2).
        *   Estimated total travel distance.
        *   Keys needed per portal (calculated based on outgoing links from each portal in the final plan).
        *   Estimated AP gained.

2.  **Map Visualisation (`self.drawPlan`):**
    *   Create multiple `L.LayerGroup`s for the visualization (e.g., `fanfieldLinksPhase1`, `fanfieldFieldsPhase1`, `fanfieldLinksPhase2`, `fanfieldFieldsPhase2`).
    *   Use distinct colors to differentiate between Phase 1 (base construction) and Phase 2 (final fields) links/fields on the map.
    *   Draw the planned links and fields onto these layers.

### Phase 4: Integration and Refinement

1.  **Event Handlers (`self.attachEventHandler`):**
    *   Wire up all buttons and UI interactions.
2.  **Clear/Reset Logic:** Implement a robust `self.clearPlan` function to reset the plugin's state.
3.  **Error Handling & User Feedback:** Provide clear messages for insufficient portals, calculation errors, etc.
4.  **Testing and Debugging:** Thoroughly test the plugin with various scenarios (different numbers of base portals, different geographical layouts) to ensure correctness and stability.

---

**Next Steps:** Proceed with Phase 1 (UI Design & Implementation).
