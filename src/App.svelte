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
  export let issDataSource;

  let apogee = 100.0 * 1000; // Min 100 km (1 km above the Karman line)
  let perigee = 100.0 * 1000; // Min 100 km (1 km above the Karman line)
  const KARMAN_LINE = 100.0 * 1000; // 100 km
  const SUPER_SYNCH = 42164.0 * 1000; // Super synchronous orbit ~ 42,164 km
  let INCLINATION = 51.6;
  let RA_OF_ASC_NODE = 0;
  let ARG_OF_PERICENTER = 0;
  let MEAN_ANOMALY = 45;
  let useECCENTRICITY = false;
  let ECCENTRICITY = 0.01;

  const ISS_OMM = {
    CCSDS_OMM_VERS: 0,
    CREATION_DATE: null,
    ORIGINATOR: null,
    OBJECT_NAME: "ISS (ZARYA)",
    OBJECT_ID: "1998-067A",
    CENTER_NAME: null,
    REFERENCE_FRAME: 2,
    REFERENCE_FRAME_EPOCH: null,
    TIME_SYSTEM: 11,
    MEAN_ELEMENT_THEORY: 0,
    COMMENT: null,
    EPOCH: new Date().toISOString(),
    SEMI_MAJOR_AXIS: 0,
    MEAN_MOTION: 15.51025615,
    ECCENTRICITY: 0.0003349,
    INCLINATION: 51.6355,
    RA_OF_ASC_NODE: 150.5366,
    ARG_OF_PERICENTER: 149.2285,
    MEAN_ANOMALY: 210.8902,
    GM: 0,
    MASS: 0,
    SOLAR_RAD_AREA: 0,
    SOLAR_RAD_COEFF: 0,
    DRAG_AREA: 0,
    DRAG_COEFF: 0,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: "U",
    NORAD_CAT_ID: 25544,
    ELEMENT_SET_NO: 999,
    REV_AT_EPOCH: 45244,
    BSTAR: 0.00028217,
    MEAN_MOTION_DOT: 0.00016275,
    MEAN_MOTION_DDOT: 0,
    COV_REFERENCE_FRAME: 23,
    CX_X: 0,
    CY_X: 0,
    CY_Y: 0,
    CZ_X: 0,
    CZ_Y: 0,
    CZ_Z: 0,
    CX_DOT_X: 0,
    CX_DOT_Y: 0,
    CX_DOT_Z: 0,
    CX_DOT_X_DOT: 0,
    CY_DOT_X: 0,
    CY_DOT_Y: 0,
    CY_DOT_Z: 0,
    CY_DOT_X_DOT: 0,
    CY_DOT_Y_DOT: 0,
    CZ_DOT_X: 0,
    CZ_DOT_Y: 0,
    CZ_DOT_Z: 0,
    CZ_DOT_X_DOT: 0,
    CZ_DOT_Y_DOT: 0,
    CZ_DOT_Z_DOT: 0,
    USER_DEFINED_BIP_0044_TYPE: 0,
    USER_DEFINED_OBJECT_DESIGNATOR: null,
    USER_DEFINED_EARTH_MODEL: null,
    USER_DEFINED_EPOCH_TIMESTAMP: 0,
    USER_DEFINED_MICROSECONDS: 0,
  };

  const options = {
    id: "25544",
    name: "ISS",
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

  const ISS = new SpaceEntity(options, ISS_OMM);

  async function updateOrbit() {
    ISS.position.removeAllOMM();
    ISS_OMM.INCLINATION = INCLINATION;
    ISS_OMM.RA_OF_ASC_NODE = RA_OF_ASC_NODE;
    ISS_OMM.ARG_OF_PERICENTER = ARG_OF_PERICENTER;
    ISS_OMM.MEAN_ANOMALY = MEAN_ANOMALY;

    //@ts-ignore
    ISS.path.show = false;
    setTimeout(() => {
      //@ts-ignore
      ISS.path.show = true;
    }, 10);
    const newOMM = await Analysis.calculateMeanElements(
      1,
      apogee, //APOGEE,
      perigee, //PERIGEE,
      INCLINATION, //ISS_OMM.INCLINATION,
      RA_OF_ASC_NODE, //ISS_OMM.RA_OF_ASC_NODE,
      ARG_OF_PERICENTER, //ISS_OMM.ARG_OF_PERICENTER,
      MEAN_ANOMALY, //ISS_OMM.MEAN_ANOMALY,
      0.00028217 //ISS_OMM.BSTAR
    );
    const ISS2 = new SpaceEntity(
      {
        ...options,
        id: "1",
        point: { pixelSize: 10, color: Color.BLUE },
      },
      newOMM
    );
    ISS2.showOrbit({ show: true });
    issDataSource.entities.removeAll();
    issDataSource.entities.add(ISS2);
    viewer.referenceFrame = 1;
  }

  onMount(async () => {
    viewer = new Viewer("orbpro", {
      timeline: false,
      timelineContainer: true,
    });

    globalThis.viewer = viewer;

    issDataSource = new SpaceCatalogDataSource({ name: "issSource" });
    globalThis.ISS = ISS;
    issDataSource.entities.add(ISS);
    ISS.showOrbit({ show: true });
    //ISS.showCoverage({ show: true });
    dynamicTimeline = new DynamicTimeline(viewer.timeline.container, viewer);
    viewer.dataSources.add(issDataSource);

    viewer.extend(viewerReferenceFrameMixin);
    viewer.referenceFrame = 1;
  });

  onDestroy(() => {
    if (viewer) {
      try {
        viewer.dataSources.remove(issDataSource);
        viewer.destroy();
      } catch (e) {}
    }
  });
</script>

<div id="orbpro"></div>

<div class="controls">
  <label>
    Apogee:
    <input
      type="range"
      min={KARMAN_LINE}
      max={SUPER_SYNCH}
      bind:value={apogee}
      on:change={updateOrbit} />
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
        on:change={updateOrbit} />
      <span>{ECCENTRICITY}</span>
    {:else}
      Perigee:
      <input
        type="range"
        min={KARMAN_LINE}
        max={SUPER_SYNCH}
        bind:value={perigee}
        on:change={updateOrbit} />
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
      on:change={updateOrbit} />
    <span>{INCLINATION}</span>
  </label>
  <label>
    RA_OF_ASC_NODE:
    <input
      type="range"
      min="0"
      max="360"
      bind:value={RA_OF_ASC_NODE}
      on:change={updateOrbit} />
    <span>{RA_OF_ASC_NODE}</span>
  </label>
  <label>
    Arg of Perigee:
    <input
      type="range"
      min="0"
      max="360"
      bind:value={ARG_OF_PERICENTER}
      on:change={updateOrbit} />
    <span>{ARG_OF_PERICENTER}</span>
  </label>
  <label>
    Mean Anomaly:
    <input
      type="range"
      min="0"
      max="360"
      bind:value={MEAN_ANOMALY}
      on:change={updateOrbit} />
    <span>{MEAN_ANOMALY}</span>
  </label>
  <label>
    Use ECCENTRICITY:
    <input
      type="checkbox"
      bind:checked={useECCENTRICITY}
      on:change={updateOrbit} />
  </label>
</div>

<style>
  #orbpro {
    width: 100vw;
    height: 100vh;
  }

  .controls {
    color:black;
    position: absolute;
    top: 10px;
    left: 10px;
    background: rgba(255, 255, 255, 0.8);
    padding: 10px;
    border-radius: 5px;
  }

  .controls label {
    display: block;
    margin-bottom: 10px;
  }

  .controls input[type="range"] {
    width: 100%;
  }
</style>
