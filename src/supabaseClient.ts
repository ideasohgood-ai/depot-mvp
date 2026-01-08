// src/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dnbtoubfvqyaeqogvzdz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuYnRvdWJmdnF5YWVxb2d2emR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1OTczNDEsImV4cCI6MjA4MzE3MzM0MX0.aXE12IrixN6hAtv-JiR6HcbXDg0gjZU6Wj_CgZWaikM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
