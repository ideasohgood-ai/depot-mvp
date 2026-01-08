# Depot Bays MVP Demo

Interactive depot simulation built with React, TypeScript, Vite, and Supabase. It models buses entering a depot, moving through checkpoints, receiving bay allocations, and parking on different levels.[file:4][file:7]

## Features

- **Simulation Panel**
  - Trigger bus entry/exit at the depot gates.
  - Identify buses via ANPR or RFID fallback.
  - Move buses through named checkpoints and between levels.
  - Auto-move to allocated bay or a random free bay on the current level.[file:4]

- **Driver View**
  - Show the driver their assigned level, area, lot, and bay code.
  - Confirm parking and detect wrong-bay parking after multiple attempts.
  - Record override parking and update bay availability.[file:3]

- **Slot Allocation Dashboard**
  - Visualise bay availability by level, area, and charging capability.
  - Manually allocate bays by plate.
  - Auto-allocate based on charging requirements.[file:5]

- **Override Alerts**
  - List historical and active override incidents.
  - Compare allocated vs actual bay, level, and charging/maintenance fit.[file:6]

- **Depot Map**
  - 2D map of bus positions using `bus_positions` coordinates.
  - Filters markers by current level via `depot_floors` IDs.
  - “Locate” control to jump to the level where a specific bus currently is.[file:2][file:23]

## Tech Stack

- React + TypeScript + Vite
- Supabase (PostgreSQL + auto-generated APIs)
- Custom CSS panels (no UI framework)
- ESLint for basic type-aware linting

## Getting Started

### Prerequisites

- Node.js (LTS recommended)
- A Supabase project with the `buses`, `bays`, `allocations`, `bus_positions`, `checkpoints`, and `depot_floors` tables set up as in the schema snippet.

### 1. Clone the repository

```bash
git clone https://github.com/ideasohgood-ai/depot-mvp.git
cd depot-mvp
```

### 2. Install dependencies

```bash
npm install

### 3. Configure environment
Create a .env.local file in the project root:
```bash
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```
These values come from your Supabase project settings.

### 4. Run the dev server
```bash
npm run dev
```

Open the URL printed in the terminal (typically http://localhost:5173) to use the app.

### Database Model (overview)
- buses – one row per bus, with plate_number, status, needs_charging, needs_maintenance.
- depot_floors – depot levels, each with id (UUID) and level_number (1–4).
- bays – parking bays on each floor, including area_code, lot_number, bay_code, is_charging_bay, is_available, x, y.
- allocations – mapping of buses to bays with status, priority_reason, wrong_attempts, and optional override_bay_id.
- bus_positions – time-series history of bus positions (bus_id, floor_id, x, y, source, created_at).
- checkpoints – named coordinates per floor used for entry/exit and intermediate checkpoints.[file:4]

### Database Model (overview)
To load demo data, run sample-data.sql in the Supabase SQL editor after creating the tables.

## Notes
- This project is intended as a hackathon-style MVP; it focuses on clear data flows and simulations rather than full production hardening.
- Do not commit real Supabase keys; keep them only in your local `.env.local`.
