<script>
  import { onMount, onDestroy } from "svelte";
  import {
    Viewer,
    SpaceEntity,
    Color,
    Cartesian2,
    NearFarScalar,
    Cartesian3,
    SpaceCatalogDataSource,
    DynamicTimeline,
    viewerReferenceFrameMixin,
    Analysis,
  } from "orbpro";
  import "./style.css";
  import "orbpro/style/widgets.css";

  export let viewer;
  export let dynamicTimeline;
  export let satDataSource;

  let apogee = 500.0 * 1000; // 300 km
  let perigee = 500.0 * 1000; // 100 km
  const KARMAN_LINE = 100.0 * 1000; // 100 km
  const SUPER_SYNCH = 42164.0 * 1000; // Super synchronous orbit ~ 42,164 km
  let INCLINATION = 0;
  let RA_OF_ASC_NODE = 0;
  let ARG_OF_PERICENTER = 0;
  let MEAN_ANOMALY = 45;
  let useECCENTRICITY = false;
  let ECCENTRICITY = 0.01;
  let OMM = {};

  const options = {
    id: "25544",
    name: "SAT",
    point: {
      pixelSize: 10,
    },
    label: {
      show: false,
      font: `1rem Helvetica`,
      showBackground: true,
      backgroundColor: new Color(0.1, 0.1, 0.1, 0.9),
      pixelOffset: new Cartesian2(10, 0),
      scaleByDistance: new NearFarScalar(1.5e2, 1.5, 13.0e7, 0.0),
      pixelOffsetScaleByDistance: new NearFarScalar(1.5e2, 3.0, 1.5e7, 0.5),
    },
    viewFrom: new Cartesian3(
      -1678500.7493507154,
      -17680994.63403464,
      24667690.486357275
    ),
  };

  let SAT;

  async function updateOrbit() {
    satDataSource.entities.removeAll();

    if (useECCENTRICITY) {
      perigee = (apogee * (1 - ECCENTRICITY)) / (1 + ECCENTRICITY);
    }
    if(apogee<perigee){
      perigee = apogee;
      updateOrbit();
      return;
    }
    const newOMM = await Analysis.calculateMeanElements(
      1,
      apogee,
      perigee,
      INCLINATION,
      RA_OF_ASC_NODE,
      ARG_OF_PERICENTER,
      MEAN_ANOMALY,
      0.00028217
    );
    SAT = new SpaceEntity(
      {
        ...options,
        id: "1",
        point: { pixelSize: 10, color: Color.WHITE },
      },
      newOMM
    );
    SAT.showOrbit({ show: true });
    SAT.showCoverage({ show: true });
    satDataSource.entities.add(SAT);
    viewer.referenceFrame = 1;
  }

  onMount(async () => {
    viewer = new Viewer("orbpro", {
      timeline: false,
      timelineContainer: true,
    });

    globalThis.viewer = viewer;

    satDataSource = new SpaceCatalogDataSource({ name: "satSource" });
    dynamicTimeline = new DynamicTimeline(viewer.timeline.container, viewer);
    viewer.dataSources.add(satDataSource);

    viewer.extend(viewerReferenceFrameMixin);
    viewer.referenceFrame = 1;
    updateOrbit();
  });

  onDestroy(() => {
    if (viewer) {
      try {
        viewer.dataSources.remove(satDataSource);
        viewer.destroy();
      } catch (e) {}
    }
  });
</script>

<div id="orbpro"></div>

<div class="controls">
  <label>
    APOGEE:
    <input
      type="range"
      min={KARMAN_LINE}
      max={SUPER_SYNCH}
      bind:value={apogee}
      on:input={updateOrbit} />
    <span>{apogee}</span>
  </label>
  <label>
    {#if useECCENTRICITY}
      ECCENTRICITY:
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        bind:value={ECCENTRICITY}
        on:input={updateOrbit} />
      <span>{ECCENTRICITY}</span>
    {:else}
      PERIGEE:
      <input
        type="range"
        min={KARMAN_LINE}
        max={apogee}
        bind:value={perigee}
        on:input={updateOrbit}
        disabled={useECCENTRICITY} />
      <span>{perigee}</span>
    {/if}
  </label>
  <label>
    INCLINATION:
    <input
      type="range"
      min="0"
      max="90"
      bind:value={INCLINATION}
      on:input={updateOrbit} />
    <span>{INCLINATION}</span>
  </label>
  <label>
    RIGHT ASCENSION:
    <input
      type="range"
      min="0"
      max="360"
      bind:value={RA_OF_ASC_NODE}
      on:input={updateOrbit} />
    <span>{RA_OF_ASC_NODE}</span>
  </label>
  <label>
   ARGUMENT OF PERIGEE:
    <input
      type="range"
      min="0"
      max="360"
      bind:value={ARG_OF_PERICENTER}
      on:input={updateOrbit} />
    <span>{ARG_OF_PERICENTER}</span>
  </label>
  <label>
    MEAN ANOMALY:
    <input
      type="range"
      min="0"
      max="360"
      bind:value={MEAN_ANOMALY}
      on:input={updateOrbit} />
    <span>{MEAN_ANOMALY}</span>
  </label>
  <label>
    Use ECCENTRICITY:
    <input
      type="checkbox"
      bind:checked={useECCENTRICITY}
      on:change={updateOrbit} />
  </label>
  <div>
    Eccentricity:
    <span>{ECCENTRICITY}</span>
  </div>
</div>

<style>
  #orbpro {
    width: 100vw;
    height: 100vh;
  }

  .controls {
    color: black;
    position: absolute;
    top: 10px;
    left: 10px;
    background: rgba(255, 255, 255, 0.8);
    padding: 10px;
    border-radius: 5px;
    width:20vw;
    font-size: .8rem;
  }

  .controls label {
    display: block;
    margin-bottom: 10px;
  }

  .controls input[type="range"] {
    width: 100%;
  }
</style>
