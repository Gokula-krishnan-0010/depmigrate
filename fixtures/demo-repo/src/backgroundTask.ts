import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Location from 'expo-location';
import { Barometer } from 'expo-sensors';
import { db } from '../db';
import { pressureReadings } from '../db/schema';
import { lt } from 'drizzle-orm';
import { runAnomaly } from './anomaly';

export const TASK_NAME = 'AEROMESH_PRESSURE_TASK';
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    // 1. Read location
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    // 2. Read barometer (one-shot subscription trick)
    const pressure = await new Promise<number>((resolve) => {
      const sub = Barometer.addListener(({ pressure }) => {
        sub.remove();
        resolve(pressure);
      });
    });

    const now = Date.now();

    // 3. Persist to SQLite
    await db.insert(pressureReadings).values({
      pressure,
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      altitude: location.coords.altitude ?? undefined,
      ts: now,
    });

    // 4. Prune readings older than 3 hours
    await db.delete(pressureReadings).where(
      lt(pressureReadings.ts, now - THREE_HOURS_MS)
    );

    // 5. Run anomaly detection on fresh window
    await runAnomaly();

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (e) {
    console.error('[TASK] Failed:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundTask() {
  await BackgroundFetch.registerTaskAsync(TASK_NAME, {
    minimumInterval: 120,       // every 2 minutes
    stopOnTerminate: false,
    startOnBoot: true,
  });
}