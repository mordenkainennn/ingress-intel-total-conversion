# Maximal Field Planner - Development Roadmap

## Introduction

This document outlines the phased development plan for the `Maximal Field Planner` plugin. The goal is to ensure a structured, iterative development process, delivering value at each stage and mitigating risks associated with the project's complexity.

The plugin's core logic is based on a "path-driven, dynamic generation" model as described in the development documentation.

---

## Phase 1: Core UI & "Outbound Trip" Planning (MVP)

**Goal:** Create a functional Minimum Viable Product (MVP) that can plan the first half of the user's journey, establishing the structural backbone and validating core logic.

**Key Features:**
- **User Interface:** Implement a dialog for user inputs:
    - Anchor Portal (`A`) selection.
    - Base Portals (`B0`, `B1`) selection.
- **Portal Identification:** Automatically identify all portals located inside the primary `A-B0-B1` triangle.
- **Path Generation:** Generate a simple, sequential travel path from `B0` to `B1` visiting all interior portals.
- **"Outbound Trip" Plan Generation:**
    - Implement the **Phase 1** logic from the design document.
    - Generate a step-by-step text plan instructing the player to travel from `B0` to `B1`.
    - The plan will include actions to link each visited portal to the Anchor (`A`).
- **Constraint Integration (Early):**
    - Implement `outDegree` counting for all portals.
    - Calculate and display the SBUL requirements for this initial phase.

**Deliverable:** A usable plugin that generates a clear "setup" plan. Users can define an area and immediately see the path for the outbound trip and understand the initial SBUL resource costs.

---

## Phase 2: "Return Trip" & Dynamic Field Generation

**Goal:** Implement the core, complex logic of generating fields during the return journey.

**Key Features:**
- **"Return Trip" Plan Generation:**
    - Implement the **Phase 2** logic.
    - Simulate the player's return trip from `B1` to `B0`.
- **Dynamic Linking Algorithm:**
    - As the return path is simulated, greedily decide which new links to create between portals.
    - This algorithm must perform real-time constraint checks at every step:
        - **Intersection Check:** Ensure new links do not cross any existing links.
        - **Link Capacity Check:** Ensure the source portal has available outgoing link slots (respecting SBUL limits).
- **Plan Integration:** Add the newly generated link and field creation steps to the overall plan output.

**Deliverable:** The plugin can now generate a near-complete action plan, including the creation of the main internal field structure. The core value of the plugin becomes apparent in this phase.

---

## Phase 3: Finalization, Optimization & UX Polish

**Goal:** Implement the final high-impact steps, optimize the plan, and polish the user experience into a finished product.

**Key Features:**
- **"Zipper" Link Implementation:**
    - Implement the **Phase 3** logic: adding the final, critical `B0 <-> B1` link to "zip up" the entire structure.
- **"Cleanup" Pass:**
    - Implement the **Phase 4** logic: an optional final pass to find and add any remaining possible links inside the sealed structure.
- **UI/UX Refinement:**
    - Improve the visualization, using different colors/styles for links from different phases.
    - Enhance the layout and clarity of the final text-based plan.
    - Add comprehensive help and usage instructions.

**Deliverable:** A feature-complete, robust, and user-friendly `Maximal Field Planner` plugin that provides a full, optimized, and executable plan from start to finish.
