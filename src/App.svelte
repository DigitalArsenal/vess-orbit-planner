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
    SceneMode,
    ReferenceFrame,
    Ellipsoid,
  } from "orbpro";
  import "./style.css";
  import "orbpro/style/widgets.css";
  import {
    uniqueNamesGenerator,
    adjectives,
    animals,
  } from "unique-names-generator";

  const customConfig = {
    dictionaries: [adjectives, animals],
    separator: "-",
    length: 2,
  };

  const satelliteName = uniqueNamesGenerator(customConfig);

  export let viewer;
  export let dynamicTimeline;
  export let satDataSource;
  export let debugPrimitive;
  let showModal = false;
  let modalContent = {};
  let positionVelocity = {
    position: { x: "0", y: "0", z: "0" },
    velocity: { x: "0", y: "0", z: "0" },
  };

  const options = {
    id: "0001",
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
  };

  let jsonOMM;
  let SAT;
  let coverage = true;
  let useCurrentTimeAsEpoch =
    getParameterByName("useCurrentTimeAsEpoch") === "true" || false;
  let name =
    getParameterByName("name") ||
    uniqueNamesGenerator(customConfig).toUpperCase() + "-SAT";

  let pathLengthFactor =
    parseFloat(getParameterByName("pathLengthFactor")) || 1;

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
    for (const attr in attributes) {
      params.set(attr, attributes[attr].value.toString());
    }
    if (name) {
      params.set("name", name);
    } else {
      params.delete("name");
    }
    if (pathLengthFactor > 1) {
      params.set("pathLengthFactor", pathLengthFactor);
    } else {
      params.delete("pathLengthFactor");
    }
    params.set("useCurrentTimeAsEpoch", useCurrentTimeAsEpoch.toString());
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?${params}`
    );
  }

  const minap = parseFloat(
    (Ellipsoid.WGS84.maximumRadius / 1000 + 100.0).toFixed(3)
  );

  let attributes = {
    apogee: {
      units: "km",
      value: parseFloat(getParameterByName("apogee")) || minap,
      min: minap,
      max: 70_000.0,
      step: 1,
      description: "APOGEE",
      fullDescription:
        "Apogee is the point in the orbit of an object where it is farthest from the Earth.",
    },
    perigee: {
      units: "km",
      value: parseFloat(getParameterByName("perigee")) || minap,
      min: minap,
      max: 70_000.0,
      step: 1,
      description: "PERIGEE",
      fullDescription:
        "Perigee is the point in the orbit of an object where it is nearest to the Earth.",
    },
    inclination: {
      units: "deg",
      value: parseFloat(getParameterByName("inclination")) || 0,
      min: 0,
      max: 179.999999,
      description: "INCLINATION",
      fullDescription:
        "Inclination is the angle between the orbital plane of an object and the equatorial plane of the Earth.",
    },
    ra_of_asc_node: {
      units: "deg",
      value: parseFloat(getParameterByName("ra_of_asc_node")) || 0,
      min: 0,
      max: 360,
      description: "RIGHT ASCENSION",
      fullDescription:
        "Right Ascension of the Ascending Node (RAAN) is the angle from a reference direction to the direction of the ascending node.",
    },
    arg_of_pericenter: {
      units: "deg",
      value: parseFloat(getParameterByName("arg_of_pericenter")) || 0,
      min: 0,
      max: 360,
      description: "ARGUMENT OF PERIGEE",
      fullDescription:
        "The argument of perigee is the angle from the ascending node to the perigee, measured in the orbital plane.",
    },
    mean_anomaly: {
      units: "deg",
      value: parseFloat(getParameterByName("mean_anomaly")) || 0,
      min: 0,
      max: 360,
      description: "MEAN ANOMALY",
      fullDescription:
        "Mean Anomaly is the fraction of an orbital period that has elapsed since the last periapsis.",
    },
    use_eccentricity: {
      value: getParameterByName("use_eccentricity") !== "true" || true,
      description: "USE ECCENTRICITY",
      fullDescription:
        "Use Eccentricity to determine if the orbit should consider the elliptical shape.",
    },
    eccentricity: {
      units: "",
      value: parseFloat(getParameterByName("eccentricity")) || 0,
      min: 0,
      max: 1,
      step: 0.01,
      description: "ECCENTRICITY",
      fullDescription:
        "Eccentricity is a parameter that determines the amount by which its orbit around another body deviates from a perfect circle.",
    },
  };

  function openModal(key) {
    modalContent = attributes[key];
    showModal = true;
  }

  function closeModal() {
    showModal = false;
  }

  let debugPrimitiveEnabled = true;
  let updateDebugPrimitiveModelMatrix;

  async function updateOrbit() {
    let isTracked;
    if (viewer.trackedEntity) {
      viewer.trackedEntity = null;
      isTracked = true;
    }
    satDataSource.entities.remove(SAT);

    if (attributes.use_eccentricity.value) {
      attributes.perigee.value = Math.max(
        (attributes.apogee.value * (1 - attributes.eccentricity.value)) /
          (1 + attributes.eccentricity.value),
        minap
      );
    } else {
      attributes.eccentricity.value = Math.min(
        0.97,
        Math.max(
          (attributes.apogee.value - attributes.perigee.value) /
            (attributes.apogee.value + attributes.perigee.value),
          0
        )
      );
    }

    if (attributes.apogee.value < attributes.perigee.value) {
      attributes.perigee.value = attributes.apogee.value;
      return;
    }

    jsonOMM = await Analysis.calculateMeanElements(
      1,
      Math.max(minap, attributes.apogee.value * 1000),
      Math.max(minap, attributes.perigee.value * 1000),
      attributes.inclination.value,
      attributes.ra_of_asc_node.value,
      attributes.arg_of_pericenter.value,
      attributes.mean_anomaly.value,
      0.0,
      useCurrentTimeAsEpoch
        ? JulianDate.toIso8601(viewer.clock.currentTime)
        : "2024-03-20T03:06:00.000Z"
    );

    viewer.dataSources.remove(satDataSource);
    satDataSource = new SpaceCatalogDataSource({ name: "satSource" });
    viewer.dataSources.add(satDataSource);

    SAT = new SpaceEntity(
      {
        ...options,
        id: new Date().getTime().toString(),
        point: { pixelSize: 10, color: Color.WHITE },
      },
      jsonOMM
    );
    SAT.showOrbit({ show: true });
    if (coverage) {
      SAT.showCoverage({ show: true });
    }

    satDataSource.entities.add(SAT);
    if (isTracked) {
      viewer.trackedEntity = SAT;
    }
    updateURLParams();
    globalThis.SAT = SAT;
    setTimeout(() => {
      let newLeadTime = (86400 * pathLengthFactor) / 2;
      if (attributes.apogee.value < 16000) {
        newLeadTime /= 4;
      }
      if (pathLengthFactor > 1) {
        SAT.path.leadTime = newLeadTime;
        SAT.path.trailTime = newLeadTime;
      }
    }, 100);
  }

  function resetScenario() {
    viewer.clock.currentTime = JulianDate.fromIso8601(
      "2024-03-20T03:06:00.000Z"
    );
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
        width: 1.5,
      });

      viewer.scene.primitives.add(debugPrimitive);
      updateDebugPrimitiveModelMatrix = viewer.clock.onTick.addEventListener(
        () => {
          debugPrimitive.modelMatrix = modelMatrixCallback();
          const position = SAT.position.getValueInReferenceFrame(
            viewer.clock.currentTime,
            ReferenceFrame.INERTIAL
          );
          const velocity = SAT._velocity.getValueInReferenceFrame(
            viewer.clock.currentTime,
            ReferenceFrame.INERTIAL
          );

          positionVelocity = {
            position: {
              x: (position.x / 1000).toFixed(2),
              y: (position.y / 1000).toFixed(2),
              z: (position.z / 1000).toFixed(2),
            },
            velocity: {
              x: (velocity.x / 1000).toFixed(2),
              y: (velocity.y / 1000).toFixed(2),
              z: (velocity.z / 1000).toFixed(2),
            },
          };
        }
      );
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
      geocoder: false,
      navigationHelpButton: false,
      baseLayerPicker: false,
      showRenderLoopErrors: false,
    });

    viewerReferenceFrameMixin(viewer);

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
    ["cesium-credit-expand-link", "cesium-credit-textContainer"].map((t) => {
      const tt = document.getElementsByClassName(t)[0];
      tt.parentElement.removeChild(tt);
    });
  });

  function changeView(view) {
    console.log("Changing view to:", view);
    if (view === "3D") {
      viewer.scene.mode = SceneMode.SCENE3D;
    } else if (view === "2D") {
      viewer.scene.mode = SceneMode.SCENE2D;
    } else if (view === "2.5D") {
      viewer.scene.mode = SceneMode.COLUMBUS_VIEW;
    }
  }

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

  function updatepathLengthFactor(event) {
    pathLengthFactor = parseFloat(event.target.value);
    updateOrbit();
  }

  function makeOrbitDarker() {
    const currentTime = JulianDate.toIso8601(viewer.clock.currentTime);
    const epoch = JulianDate.fromIso8601(currentTime);

    const fadeFactor = 0.05;
    const orbitEntity = SAT;

    if (orbitEntity && orbitEntity.path) {
      const pathMaterial = orbitEntity.path.material;

      viewer.clock.onTick.addEventListener(() => {
        const now = viewer.clock.currentTime;
        const secondsFromEpoch = JulianDate.secondsDifference(now, epoch);

        const darknessFactor = Math.min(
          1,
          Math.abs(secondsFromEpoch * fadeFactor)
        );

        pathMaterial.color = new Color(
          1.0 - darknessFactor,
          1.0 - darknessFactor,
          1.0 - darknessFactor,
          1.0
        );
      });
    }
  }

  onMount(() => {
    makeOrbitDarker();
  });
</script>

<div id="orbpro"></div>

<div class="controls">
  <label
    style="user-select:none;text-align:left;display:flex;gap:5px;align-items:center;justify-items:center">
    <div>NAME</div>
    <input
      autocomplete="off"
      on:keypress={updateURLParams}
      type="text"
      maxlength="25"
      style="border-radius:5px;color:white;text-align:center;padding:5px;width:80%;margin:auto"
      bind:value={name} />
  </label>
  {#each Object.keys(attributes) as key}
    <label style="text-align:left;user-select:none">
      {#if key === "eccentricity"}
        <input
          style="position:relative;top:2px"
          type="checkbox"
          bind:checked={attributes["use_eccentricity"].value}
          on:input={updateOrbit} />
      {/if}
      {#if key !== "use_eccentricity"}
        <div style="display:flex;gap:5px">
          <div>{attributes[key].description}</div>
          {#if key !== "eccentricity"}
            <div>({attributes[key].units})</div>
          {/if}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="info-button" on:click={() => openModal(key)}>?</div>
        </div>
      {/if}
      {#if key === "eccentricity"}
        <div style="display:flex;gap:5px">
          {#if attributes.use_eccentricity.value}
            <input
              type="range"
              min={attributes[key].min}
              max={attributes[key].max}
              step={attributes[key].step}
              bind:value={attributes[key].value}
              on:input={updateOrbit} />
          {/if}
          <input
            type="number"
            min={attributes[key].min}
            max={attributes[key].max}
            step={attributes[key].step}
            bind:value={attributes[key].value}
            on:input={updateOrbit}
            style="width:100%;flex: 1; background-color: white; color: black; text-align: center;border-radius:5px;padding-left:15px" />
        </div>
      {:else if key === "perigee" && attributes.use_eccentricity.value}
        <br />
        <span>{attributes[key].value}</span>
      {:else if key === "perigee"}
        <div style="display:flex;gap:5px">
          <input
            style="width:50%"
            type="range"
            min={attributes[key].min}
            max={attributes[key].max}
            step={attributes[key].step}
            bind:value={attributes[key].value}
            on:input={updateOrbit} />
          <input
            min={attributes[key].min}
            max={attributes[key].max}
            step={attributes[key].step}
            type="number"
            on:input={updateOrbit}
            bind:value={attributes[key].value}
            style="width:100%;flex: 1; background-color: white; color: black; text-align: center;border-radius:5px;padding-left:15px" />
        </div>
      {:else if key !== "use_eccentricity"}
        <div style="display:flex;gap:5px">
          <input
            style="width:50%"
            type="range"
            min={attributes[key].min}
            max={attributes[key].max}
            step={attributes[key].step}
            bind:value={attributes[key].value}
            on:input={updateOrbit} />
          <input
            min={attributes[key].min}
            max={attributes[key].max}
            step={attributes[key].step}
            type="number"
            on:change={updateOrbit}
            bind:value={attributes[key].value}
            style="width:100%;flex: 1; background-color: white; color: black; text-align: center;border-radius:5px;padding-left:15px" />
        </div>
      {/if}
    </label>
  {/each}
  <hr style="margin:10px" />
  <label>
    <input
      type="checkbox"
      bind:checked={useCurrentTimeAsEpoch}
      on:change={updateURLParams} />
    Use Current Time as Epoch
  </label>
  <hr style="margin:10px" />
  <div style="display:flex;gap:5px;align-items:center;justify-items:center">
    <button
      style="background:#333333;color:white;padding:5px; border-radius:5px;margin:auto;width:100%;font-size:.5rem"
      on:click={resetScenario}>RESET VERNAL EQUINOX.</button>

    <a href="https://gssc.esa.int/navipedia/index.php/Sidereal_Time">
      <button class="info-button">?</button></a>
    <br />
  </div>
</div>

<div class="debug-controls" style="gap:5;display:flex;flex-direction:column">
  <div
    style="display:flex;flex-direction:row;text-align:center;justify-content:space-between;width:100%;">
    <button on:click={() => changeView("3D")} style="flex:1;">3D</button>
    <button on:click={() => changeView("2D")} style="flex:1;">2D</button>
    <button on:click={() => changeView("2.5D")} style="flex:1;">2.5D</button>
  </div>
  <hr />
  <div
    style="display:flex;flex-direction:row;text-align:center;justify-content:space-between;width:100%;">
    <button on:click={() => (viewer.referenceFrame = 0)} style="flex:1;"
      >Fixed</button>
    <button on:click={() => (viewer.referenceFrame = 1)} style="flex:1;"
      >Inertial</button>
  </div>
  <hr />
  <div style="display:flex;flex-direction:column;margin:5px;text-align:center">
    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label> J2000 Ref Frame Axes </label>
    <input
      style="margin:auto"
      type="checkbox"
      bind:checked={debugPrimitiveEnabled}
      on:change={toggleDebugPrimitive} />
  </div>
  <hr />
  <div style="display:flex;flex-direction:column;margin:5px;text-align:center">
    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>Coverage Cone </label>
    <input
      style="margin:auto"
      type="checkbox"
      bind:checked={coverage}
      on:change={updateOrbit} />
  </div>
  <hr />
  <div style="display:flex;flex-direction:column;margin:5px;text-align:center">
    <label>Path Length</label>
    <input
      type="range"
      min="1"
      max="10"
      step="0.01"
      bind:value={pathLengthFactor}
      on:input={updatepathLengthFactor} />
    <span>{pathLengthFactor}</span>
  </div>
  <hr />
  <div style="display:flex;margin-top:15px">
    <button
      style="text-align:center;width:100%;background:#333333;color:white;padding:5px; border-radius:5px;margin:auto;width:100%"
      on:click={() => {
        const jsonStr = JSON.stringify(jsonOMM, null, 4);
        const tempTextArea = document.createElement("textarea");
        tempTextArea.value = jsonStr;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        document.execCommand("copy");
        document.body.removeChild(tempTextArea);
        alert("OMM copied to clipboard");
      }}>Copy OMM</button>
  </div>
</div>

{#if showModal}
  <div class="modal">
    <div class="modal-content">
      <div
        style="display: flex; justify-content:space-between; position:relative;top:-15px;right:-5px">
        <div style="padding-top:10px"><b>{modalContent.description}</b></div>
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <span class="close" on:click={closeModal}>&times;</span>
      </div>
      <p>{modalContent.fullDescription}</p>
    </div>
  </div>
{/if}
<div class="position-velocity">
  <div>
    <p><b>Position (km):</b></p>
    <p>x: {positionVelocity.position.x}</p>
    <p>y: {positionVelocity.position.y}</p>
    <p>z: {positionVelocity.position.z}</p>
  </div>
  <div>
    <p><b>Velocity (km/s):</b></p>
    <p>x: {positionVelocity.velocity.x}</p>
    <p>y: {positionVelocity.velocity.y}</p>
    <p>z: {positionVelocity.velocity.z}</p>
  </div>
</div>

<style>
  * {
    -webkit-user-select: none; /* Safari */
    -moz-user-select: none; /* Firefox */
    -ms-user-select: none; /* Internet Explorer/Edge */
    user-select: none; /* Non-prefixed version, currently supported by Chrome, Opera and Edge */
  }
  #orbpro {
    width: 100%;
    height: 100%;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .controls {
    user-select: all;
    color: black;
    position: absolute;
    top: 10px;
    left: 10px;
    background: rgba(255, 255, 255, 0.8);
    padding: 10px;
    border-radius: 5px;
    width: 25vw;
    max-width: 250px;
    min-width: 175px;
    font-size: 0.7rem;
  }

  .debug-controls {
    color: black;
    position: fixed;
    top: 50px;
    right: 10px;
    background: rgba(255, 255, 255, 0.8);
    padding: 8px;
    border-radius: 5px;
    width: 10vw;
    min-width: 100px;
    font-size: 0.7rem;
  }

  .controls label,
  .debug-controls label {
    display: block;
    margin-bottom: 10px;
  }

  .info-button {
    background: none;
    border: none;
    color: blue;
    cursor: pointer;
    margin-left: 5px;
    width: 10px;
  }

  .modal {
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    z-index: 1;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: rgba(0, 0, 0, 0.4);
  }

  .modal-content {
    display: flex;
    flex-direction: column;
    color: black;
    background-color: #fefefe;
    margin: auto;
    padding: 20px;
    border: 1px solid #888;
    width: 80%;
    max-width: 500px;
    border-radius: 10px;
  }

  .close {
    color: #aaa;
    float: right;
    font-size: 28px;
    font-weight: bold;
    cursor: pointer;
  }

  .close:hover,
  .close:focus {
    color: black;
    text-decoration: none;
    cursor: pointer;
  }

  .position-velocity {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 5px;
    color: black;
    position: fixed;
    bottom: 50px;
    right: 10px;
    background: rgba(255, 255, 255, 0.8);
    padding: 5px;
    border-radius: 5px;
    text-align: left;
    width: 10vw;
    min-width: 100px;
    font-size: 0.7rem;
  }
</style>
