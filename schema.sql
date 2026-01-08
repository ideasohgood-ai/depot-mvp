-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bus_id uuid NOT NULL,
  bay_id uuid NOT NULL,
  priority_reason text,
  status text NOT NULL DEFAULT 'allocated'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  wrong_attempts integer,
  override_bay_id uuid,
  CONSTRAINT allocations_pkey PRIMARY KEY (id),
  CONSTRAINT allocations_bus_id_fkey FOREIGN KEY (bus_id) REFERENCES public.buses(id),
  CONSTRAINT allocations_bay_id_fkey FOREIGN KEY (bay_id) REFERENCES public.bays(id),
  CONSTRAINT allocations_override_bay_id_fkey FOREIGN KEY (override_bay_id) REFERENCES public.bays(id)
);
CREATE TABLE public.bays (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  floor_id uuid NOT NULL,
  area_code text NOT NULL,
  lot_number integer NOT NULL,
  bay_code text DEFAULT (area_code || (lot_number)::text),
  is_charging_bay boolean NOT NULL DEFAULT false,
  is_available boolean NOT NULL DEFAULT true,
  current_bus_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  x integer,
  y integer,
  CONSTRAINT bays_pkey PRIMARY KEY (id),
  CONSTRAINT bays_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES public.depot_floors(id),
  CONSTRAINT bays_current_bus_id_fkey FOREIGN KEY (current_bus_id) REFERENCES public.buses(id)
);
CREATE TABLE public.bus_positions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bus_id uuid NOT NULL,
  floor_id uuid NOT NULL,
  x integer NOT NULL,
  y integer NOT NULL,
  source text NOT NULL DEFAULT 'checkpoint'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bus_positions_pkey PRIMARY KEY (id),
  CONSTRAINT bus_positions_bus_id_fkey FOREIGN KEY (bus_id) REFERENCES public.buses(id),
  CONSTRAINT bus_positions_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES public.depot_floors(id)
);
CREATE TABLE public.buses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plate_number text NOT NULL UNIQUE,
  model text,
  needs_charging boolean NOT NULL DEFAULT false,
  needs_maintenance boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'outside'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT buses_pkey PRIMARY KEY (id)
);
CREATE TABLE public.checkpoints (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  floor_id uuid NOT NULL,
  name text NOT NULL,
  x integer NOT NULL,
  y integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT checkpoints_pkey PRIMARY KEY (id),
  CONSTRAINT checkpoints_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES public.depot_floors(id)
);
CREATE TABLE public.depot_floors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  level_number integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT depot_floors_pkey PRIMARY KEY (id)
);
