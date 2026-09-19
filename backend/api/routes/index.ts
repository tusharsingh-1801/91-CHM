import { Router } from 'express';
import { getHealth } from '../controllers/healthController.ts';
import { askAssistant } from '../controllers/assistantController.ts';
import { 
  getFields, getFieldAlerts, getFieldNdvi, getFieldNdviAnalysis, 
  getFieldWeather, calculateNdviFromScene, processNdviSentinelHub, 
  getFieldScenes, ingestSentinelScenes, ingestWeather, 
  createField, updateFieldLocation, updateField,
  getFieldEvents, createFieldEvent, deleteFieldEvent
} from '../controllers/fieldsController.ts';

export const router = Router();

router.get('/health', getHealth);
router.post('/assistant', askAssistant);

router.get('/fields', getFields);
router.post('/fields', createField);
router.patch('/fields/:fieldId', updateField);
router.patch('/fields/:fieldId/location', updateFieldLocation);
router.get('/fields/:fieldId/alerts', getFieldAlerts);
router.get('/fields/:fieldId/ndvi', getFieldNdvi);
router.get('/fields/:fieldId/ndvi/analysis', getFieldNdviAnalysis);
router.get('/fields/:fieldId/weather', getFieldWeather);
router.post('/fields/:fieldId/ndvi/from-scene/:sceneId', calculateNdviFromScene);
router.post('/fields/:fieldId/ndvi/process', processNdviSentinelHub);
router.get('/fields/:fieldId/scenes', getFieldScenes);
router.post('/fields/:fieldId/ingest/sentinel-scenes', ingestSentinelScenes);
router.post('/fields/:fieldId/ingest/weather', ingestWeather);
router.patch('/fields/:fieldId/location', updateFieldLocation);
router.get('/fields/:fieldId/events', getFieldEvents);
router.post('/fields/:fieldId/events', createFieldEvent);
router.delete('/fields/:fieldId/events/:eventId', deleteFieldEvent);

