-- sample-data.sql
-- Minimal seed data for the Depot Bays MVP demo.
-- Run this after creating the tables from schema.sql.

-------------------------
-- 1. depot_floors
-------------------------

insert into public.depot_floors (id, name, level_number) values
  ('f552ef4d-b28e-4248-92d2-b3473590bd10', 'Level 1', 1),
  ('981c8b70-e931-4a6f-8685-2e579a102e8a', 'Level 2', 2),
  ('3da25995-a132-42de-93d5-66535f5fa459', 'Level 3', 3),
  ('84e50d22-8068-4844-bc13-c1ea72ac0c26', 'Level 4', 4)
on conflict (id) do nothing;

-------------------------
-- 2. checkpoints
-------------------------
-- Layout:
-- Level 1..4 each have CP1–CP4 plus level-change checkpoints
-- The coordinates roughly match the simulation logic (x,y in metres/grid units).

-- Level 1: Entrance/Exit and CP1–CP4
insert into public.checkpoints (id, floor_id, name, x, y) values
  -- entrance / exit
  ('cp-l1-entrance', 'f552ef4d-b28e-4248-92d2-b3473590bd10', 'Entrance', 0,   0),
  ('cp-l1-exit',     'f552ef4d-b28e-4248-92d2-b3473590bd10', 'Exit',     0,   0),

  -- CP1–CP4 on Level 1
  ('cp-l1-cp1', 'f552ef4d-b28e-4248-92d2-b3473590bd10', 'CP1',  20, 10),
  ('cp-l1-cp2', 'f552ef4d-b28e-4248-92d2-b3473590bd10', 'CP2',  50, 20),
  ('cp-l1-cp3', 'f552ef4d-b28e-4248-92d2-b3473590bd10', 'CP3',  70, 30),
  ('cp-l1-cp4', 'f552ef4d-b28e-4248-92d2-b3473590bd10', 'CP4',  90, 40),

  -- level 1 <-> 2
  ('cp-l1-to-l2-up',   'f552ef4d-b28e-4248-92d2-b3473590bd10', 'Level 1 to Level 2 up',   100,  40),

  -- Level 2 CP1–CP4
  ('cp-l2-cp1', '981c8b70-e931-4a6f-8685-2e579a102e8a', 'CP1',  20, 10),
  ('cp-l2-cp2', '981c8b70-e931-4a6f-8685-2e579a102e8a', 'CP2',  50, 20),
  ('cp-l2-cp3', '981c8b70-e931-4a6f-8685-2e579a102e8a', 'CP3',  70, 30),
  ('cp-l2-cp4', '981c8b70-e931-4a6f-8685-2e579a102e8a', 'CP4',  90, 40),

  ('cp-l2-to-l1-down', '981c8b70-e931-4a6f-8685-2e579a102e8a', 'Level 2 to Level 1 down', 100,  40),
  ('cp-l2-to-l3-up',   '981c8b70-e931-4a6f-8685-2e579a102e8a', 'Level 2 to Level 3 up',   100, 100),

  -- Level 3 CP1–CP4
  ('cp-l3-cp1', '3da25995-a132-42de-93d5-66535f5fa459', 'CP1',  20, 10),
  ('cp-l3-cp2', '3da25995-a132-42de-93d5-66535f5fa459', 'CP2',  50, 20),
  ('cp-l3-cp3', '3da25995-a132-42de-93d5-66535f5fa459', 'CP3',  70, 30),
  ('cp-l3-cp4', '3da25995-a132-42de-93d5-66535f5fa459', 'CP4',  90, 40),

  ('cp-l3-to-l2-down', '3da25995-a132-42de-93d5-66535f5fa459', 'Level 3 to Level 2 down', 100, 100),
  ('cp-l3-to-l4-up',   '3da25995-a132-42de-93d5-66535f5fa459', 'Level 3 to Level 4 up',   100, 160),

  -- Level 4 CP1–CP4
  ('cp-l4-cp1', '84e50d22-8068-4844-bc13-c1ea72ac0c26', 'CP1',  20, 10),
  ('cp-l4-cp2', '84e50d22-8068-4844-bc13-c1ea72ac0c26', 'CP2',  50, 20),
  ('cp-l4-cp3', '84e50d22-8068-4844-bc13-c1ea72ac0c26', 'CP3',  70, 30),
  ('cp-l4-cp4', '84e50d22-8068-4844-bc13-c1ea72ac0c26', 'CP4',  90, 40),

  ('cp-l4-to-l3-down', '84e50d22-8068-4844-bc13-c1ea72ac0c26', 'Level 4 to Level 3 down', 100, 160)
on conflict (id) do nothing;

-------------------------
-- 3. buses
-------------------------

insert into public.buses (id, plate_number, needs_charging, needs_maintenance, status) values
  ('d2eb9b7a-d771-4030-b5a6-4702fdb2edfe', 'SBS001A', true,  false, 'outside'),
  ('b227affe-4ac5-444b-a1a4-3397da170fc2', 'SBS002B', false, false, 'outside'),
  ('953cfe44-f1f4-46d4-85a7-d6b6dba5a26e', 'SBS003C', false, false, 'outside'),
  ('9b25ac17-4946-4671-a11c-a12eabbb48d3', 'SBS004D', false, false, 'outside'),
  ('07664c29-d8a3-402e-944b-657eef1c58b3', 'SBS005E', false, false, 'outside'),
  ('ce3d110e-6420-4fc8-9150-323ced9abdf3', 'SBS006F', true,  true,  'outside')
on conflict (id) do nothing;

-------------------------
-- 4. bays
-------------------------
-- Simple 4x2 grid per level:
-- Areas A–D, lots 1–2, x and y chosen to match the map scale.

insert into public.bays (id, floor_id, area_code, lot_number, bay_code, is_charging_bay, is_available, x, y) values
  -- Level 1 bays
  ('l1-a1', 'f552ef4d-b28e-4248-92d2-b3473590bd10', 'A', 1, 'A1', true,  true, 10, 2),
  ('l1-a2', 'f552ef4d-b28e-4248-92d2-b3473590bd10', 'A', 2, 'A2', true,  true, 20, 2),
  ('l1-b1', 'f552ef4d-b28e-4248-92d2-b3473590bd10', 'B', 1, 'B1', false, true, 30, 2),
  ('l1-b2', 'f552ef4d-b28e-4248-92d2-b3473590bd10', 'B', 2, 'B2', false, true, 40, 2),
  ('l1-c1', 'f552ef4d-b28e-4248-92d2-b3473590bd10', 'C', 1, 'C1', false, true, 50, 2),
  ('l1-c2', 'f552ef4d-b28e-4248-92d2-b3473590bd10', 'C', 2, 'C2', false, true, 60, 2),
  ('l1-d1', 'f552ef4d-b28e-4248-92d2-b3473590bd10', 'D', 1, 'D1', false, true, 70, 2),
  ('l1-d2', 'f552ef4d-b28e-4248-92d2-b3473590bd10', 'D', 2, 'D2', false, true, 80, 2),

  -- Level 2 bays
  ('l2-a1', '981c8b70-e931-4a6f-8685-2e579a102e8a', 'A', 1, 'A1', true,  true, 10, 2),
  ('l2-a2', '981c8b70-e931-4a6f-8685-2e579a102e8a', 'A', 2, 'A2', true,  true, 20, 2),
  ('l2-b1', '981c8b70-e931-4a6f-8685-2e579a102e8a', 'B', 1, 'B1', false, true, 30, 2),
  ('l2-b2', '981c8b70-e931-4a6f-8685-2e579a102e8a', 'B', 2, 'B2', false, true, 40, 2),
  ('l2-c1', '981c8b70-e931-4a6f-8685-2e579a102e8a', 'C', 1, 'C1', false, true, 50, 2),
  ('l2-c2', '981c8b70-e931-4a6f-8685-2e579a102e8a', 'C', 2, 'C2', false, true, 60, 2),
  ('l2-d1', '981c8b70-e931-4a6f-8685-2e579a102e8a', 'D', 1, 'D1', false, true, 70, 2),
  ('l2-d2', '981c8b70-e931-4a6f-8685-2e579a102e8a', 'D', 2, 'D2', false, true, 80, 2),

  -- Level 3 bays
  ('l3-a1', '3da25995-a132-42de-93d5-66535f5fa459', 'A', 1, 'A1', true,  true, 10, 2),
  ('l3-a2', '3da25995-a132-42de-93d5-66535f5fa459', 'A', 2, 'A2', true,  true, 20, 2),
  ('l3-b1', '3da25995-a132-42de-93d5-66535f5fa459', 'B', 1, 'B1', false, true, 30, 2),
  ('l3-b2', '3da25995-a132-42de-93d5-66535f5fa459', 'B', 2, 'B2', false, true, 40, 2),
  ('l3-c1', '3da25995-a132-42de-93d5-66535f5fa459', 'C', 1, 'C1', false, true, 50, 2),
  ('l3-c2', '3da25995-a132-42de-93d5-66535f5fa459', 'C', 2, 'C2', false, true, 60, 2),
  ('l3-d1', '3da25995-a132-42de-93d5-66535f5fa459', 'D', 1, 'D1', false, true, 70, 2),
  ('l3-d2', '3da25995-a132-42de-93d5-66535f5fa459', 'D', 2, 'D2', false, true, 80, 2),

  -- Level 4 bays
  ('l4-a1', '84e50d22-8068-4844-bc13-c1ea72ac0c26', 'A', 1, 'A1', true,  true, 10, 2),
  ('l4-a2', '84e50d22-8068-4844-bc13-c1ea72ac0c26', 'A', 2, 'A2', true,  true, 20, 2),
  ('l4-b1', '84e50d22-8068-4844-bc13-c1ea72ac0c26', 'B', 1, 'B1', false, true, 30, 2),
  ('l4-b2', '84e50d22-8068-4844-bc13-c1ea72ac0c26', 'B', 2, 'B2', false, true, 40, 2),
  ('l4-c1', '84e50d22-8068-4844-bc13-c1ea72ac0c26', 'C', 1, 'C1', false, true, 50, 2),
  ('l4-c2', '84e50d22-8068-4844-bc13-c1ea72ac0c26', 'C', 2, 'C2', false, true, 60, 2),
  ('l4-d1', '84e50d22-8068-4844-bc13-c1ea72ac0c26', 'D', 1, 'D1', false, true, 70, 2),
  ('l4-d2', '84e50d22-8068-4844-bc13-c1ea72ac0c26', 'D', 2, 'D2', false, true, 80, 2)
on conflict (id) do nothing;
