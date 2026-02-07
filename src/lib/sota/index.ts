// SOTA Library Index - Export All Modules

// Types
export * from './types';

// Core Engines
export { SOTAContentGenerationEngine, createSOTAEngine } from './SOTAContentGenerationEngine';
export type { ExtendedAPIKeys } from './SOTAContentGenerationEngine';
export { EnterpriseContentOrchestrator, createOrchestrator } from './EnterpriseContentOrchestrator';

// Services
export { YouTubeService, createYouTubeService } from './YouTubeService';
export { ReferenceService, createReferenceService } from './ReferenceService';
export { SERPAnalyzer, createSERPAnalyzer } from './SERPAnalyzer';
export { SchemaGenerator, createSchemaGenerator } from './SchemaGenerator';
export { SOTAInternalLinkEngine, createInternalLinkEngine, type SitePage } from './SOTAInternalLinkEngine';

// NeuronWriter Integration
export { 
  NeuronWriterService, 
  createNeuronWriterService,
  getNeuronWriterService
} from './NeuronWriterService';
export type { 
  NeuronWriterProject, 
  NeuronWriterQuery, 
  NeuronWriterAnalysis, 
  NeuronWriterTerm 
} from './NeuronWriterService';

// E-E-A-T Validation
export { 
  EEATValidator, 
  createEEATValidator, 
  validateEEAT 
} from './EEATValidator';
export type { EEATScore, EEATSignal } from './EEATValidator';

// Validation & Quality
export { 
  calculateQualityScore, 
  analyzeContent, 
  detectAITriggerPhrases,
  removeAIPhrases,
  calculateKeywordDensity 
} from './QualityValidator';

// Caching
export { generationCache, serpCache, schemaCache, validationCache } from './cache';

// Performance Tracking
export { 
  globalPerformanceTracker,
  calculateAEOScore,
  calculateSemanticRichness,
  calculateLinkDensity
} from './PerformanceTracker';
