# Strength Tracker

A simple offline-first workout tracker for flexible strength plans.

## Run on Mac

```bash
cd /Users/jaredsimonelli/Documents/Playground/workout-tracker
npm start
```

Open `http://localhost:4173`.

If that port is already busy, the server will try the next port and print the URL.

## Install on Android

1. Start the app server on your Mac.
2. Make sure your Android phone is on the same Wi-Fi.
3. Open Chrome on Android and visit `http://YOUR_MAC_IP:4173`.
4. Use Chrome's menu and choose **Install app** or **Add to Home screen**.

The app stores workout data in the browser's local storage. It does not use accounts, cloud sync, or external APIs.

## Progression Formula

The plan uses a four-week wave:

- Week 1: base reps from the written plan.
- Week 2: target reps drop by 1 for most sets.
- Week 3: target reps drop by 2 for most sets.
- Week 4: deload week. Movements stay the same and working-set count is reduced about 50%.

Future weight recommendations are calculated from submitted working sets:

- A workout only enters the recommendation pool after tapping **Submit Workout**.
- Since reps are fixed targets, the app treats a submitted working set as completed at the displayed target reps and makes conservative next-weight recommendations.
- Recommendations use estimated 1RM to convert recent submitted weights to the next target rep range, then cap increases at about 5% for lower-body lifts and 2.5% for upper/accessory lifts.
- Deload weeks keep the written reps, reduce working-set count, and recommend about 90% of recent working weight.
- Normal-week recommendations ignore prior deload sessions so intentionally lighter deload work does not pull the next block down.
- Kang Squat always stays at 5 reps across all weeks.

This follows the practical shape of ACSM progression guidance: use a variety of loading ranges over time, and increase load by about 2-10% when the lifter can perform one or two reps over the target.

## Research Notes

Useful qualities borrowed from current workout trackers:

- Fast weight logging with fixed target reps on one screen.
- Offline-first storage with no account required.
- Previous-performance based weight suggestions.
- Clear progress numbers without social feeds or gamification.

Sources reviewed:

- ACSM position stand on progression models in resistance training: https://pubmed.ncbi.nlm.nih.gov/11828249/
- ACSM updated progression models paper: https://pubmed.ncbi.nlm.nih.gov/19204579/
- Offline/simple tracker feature patterns from GainLogger, SetWise, OfflineGym, LiftForge, IronLog, and replogr.
