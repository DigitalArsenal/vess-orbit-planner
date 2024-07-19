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
    DebugModelMatrixPrimitive,
    Entity,
    JulianDate,
    Matrix4,
    Transforms,
    Matrix3,
  } from "orbpro";
  import "./style.css";
  import "orbpro/style/widgets.css";

  export let viewer;
  export let dynamicTimeline;
  export let satDataSource;
  export let debugPrimitive;

  function getParameterByName(name) {
    const url = window.location.href;
    const param = name.replace(/[\[\]]/g, "\\$&");
    const regex = new RegExp(`[?&]${param}(=([^&#]*)|&|#|$)`);
    const results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return "";
    return decodeURIComponent(results[2].replace(/\+/g, " "));
  }

  function updateURLParams() {
    const params = new URLSearchParams(window.location.search);
    params.set("apogee", apogee.toString());
    params.set("perigee", perigee.toString());
    params.set("inclination", INCLINATION.toString());
    params.set("ra_of_asc_node", RA_OF_ASC_NODE.toString());
    params.set("arg_of_pericenter", ARG_OF_PERICENTER.toString());
    params.set("mean_anomaly", MEAN_ANOMALY.toString());
    params.set("use_eccentricity", useECCENTRICITY.toString());
    params.set("eccentricity", ECCENTRICITY.toString());
    params.set("epoch", EPOCH);
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?${params}`
    );
  }

  let apogee = parseFloat(getParameterByName("apogee")) || 500.0 * 1000;
  let perigee = parseFloat(getParameterByName("perigee")) || 500.0 * 1000;
  const KARMAN_LINE = 100.0 * 1000; // 100 km
  const SUPER_SYNCH = 42164.0 * 1000; // Super synchronous orbit ~ 42,164 km
  let INCLINATION = parseFloat(getParameterByName("inclination")) || 0;
  let RA_OF_ASC_NODE = parseFloat(getParameterByName("ra_of_asc_node")) || 0;
  let ARG_OF_PERICENTER =
    parseFloat(getParameterByName("arg_of_pericenter")) || 0;
  let MEAN_ANOMALY = parseFloat(getParameterByName("mean_anomaly")) || 0;
  let useECCENTRICITY =
    getParameterByName("use_eccentricity") === "true" || false;
  let ECCENTRICITY = parseFloat(getParameterByName("eccentricity")) || 0.01;
  let EPOCH = getParameterByName("epoch") || "2024-03-20T03:06:00.000Z";
  let debugPrimitiveEnabled = true;

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
    if (apogee < perigee) {
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
      0.0,
      EPOCH
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
    updateURLParams();
  }

  function resetScenario() {
    viewer.clock.currentTime = JulianDate.fromIso8601(EPOCH);
    viewer.clock.shouldAnimate = false;
  }

  function addReferenceFramePrimitives() {
    try {
      const modelMatrixCallback = () => {
        const currentTime = viewer.clock.currentTime;
        const fixedFrameToJ2000 =
          Transforms.computeIcrfToFixedMatrix(currentTime);
        return Matrix4.fromRotationTranslation(
          Matrix3.multiply(Matrix3.IDENTITY, fixedFrameToJ2000, new Matrix3()),
          Cartesian3.ZERO
        );
      };

      debugPrimitive = new DebugModelMatrixPrimitive({
        modelMatrix: modelMatrixCallback(),
        length: 30000000.0,
        width: 4.0,
      });

      viewer.scene.primitives.add(debugPrimitive);
      viewer.clock.onTick.addEventListener(() => {
        debugPrimitive.modelMatrix = modelMatrixCallback();
      });
    } catch (e) {
      setTimeout(() => {
        addReferenceFramePrimitives();
      }, 1000);
    }
  }

  function toggleDebugPrimitive() {
    if (debugPrimitiveEnabled) {
      addReferenceFramePrimitives();
    } else {
      viewer.scene.primitives.remove(debugPrimitive);
    }
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
    viewer.scene.globe.depthTestAgainstTerrain = true;

    addReferenceFramePrimitives();

    resetScenario();
    viewer.extend(viewerReferenceFrameMixin);
    viewer.referenceFrame = 1;
    viewer.camera.position = new Cartesian3(
      53307327.59909529,
      -27405954.912846245,
      7306669.414005669
    );
    updateOrbit();
  });

  onDestroy(() => {
    if (viewer) {
      try {
        viewer.dataSources.remove(satDataSource);
        viewer.destroy();
      } catch (e) {}
    }
    if (viewer && viewer.clock.onTick) {
      viewer.clock.onTick.removeEventListener(updateDebugPrimitiveModelMatrix);
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
  <hr style="margin:10px" />
  <div>
    <button
      style="background:#555555;color:white;padding:5px; border-radius:5px"
      on:click={resetScenario}>Reset VERNAL EQUINOX</button>
    <br />
    <span>{EPOCH}</span>
  </div>
</div>

<div class="debug-controls">
  <label>
    Debug Primitive:
    <input
      type="checkbox"
      bind:checked={debugPrimitiveEnabled}
      on:change={toggleDebugPrimitive} />
  </label>
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
    width: 15vw;
    max-width:200px;
    min-width: 150px;
    font-size: 0.8rem;
  }

  .debug-controls {
    color: black;
    position: fixed;
    top: 50px;
    right: 10px;
    background: rgba(255, 255, 255, 0.8);
    padding: 10px;
    border-radius: 5px;
    width: 10vw;
    min-width: 50px;
    font-size: 0.8rem;
  }

  .controls label,
  .debug-controls label {
    display: block;
    margin-bottom: 10px;
  }

</style>
