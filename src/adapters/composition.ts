import { createReadinessService, type ReadinessService } from '@/application/readiness-service';
import { DEFAULT_CONFIG } from '@/domain/types';
import type { EscalationMarks } from '@/ports';
import { createBrowserMarks } from './browser-marks';
import { bundledSources, catalogueSchema, createSampleProviders, planSchema } from './sample-providers';
import { systemClock } from './system-clock';

export const createDefaultService = (): ReadinessService =>
  createReadinessService(createSampleProviders(systemClock, DEFAULT_CONFIG), DEFAULT_CONFIG);

export const createDefaultMarks = (): EscalationMarks => createBrowserMarks();

/** Static export needs every visit page at build time. */
export const catalogueProductIds = (): string[] =>
  catalogueSchema.parse(bundledSources.catalogue).products.map((product) => product.id);

export const sampleVisitIds = (): string[] => planSchema.parse(bundledSources.plan).visits.map((visit) => visit.id);
