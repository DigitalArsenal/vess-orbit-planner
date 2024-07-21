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
  let name =
    getParameterByName("name") ||
    uniqueNamesGenerator(customConfig).toUpperCase() + "-SAT";

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
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?${params}`
    );
  }

  let attributes = {
    apogee: {
      value: parseFloat(getParameterByName("apogee")) || 500.0 * 1000,
      min: 100.0 * 1000,
      max: 70_000.0 * 1000,
      description: "APOGEE",
      fullDescription:
        "Apogee is the point in the orbit of an object where it is farthest from the Earth.",
    },
    perigee: {
      value: parseFloat(getParameterByName("perigee")) || 500.0 * 1000,
      min: 100.0 * 1000,
      max: 70_000.0 * 1000,
      description: "PERIGEE",
      fullDescription:
        "Perigee is the point in the orbit of an object where it is nearest to the Earth.",
    },
    inclination: {
      value: parseFloat(getParameterByName("inclination")) || 0,
      min: 0,
      max: 179.999999,
      description: "INCLINATION",
      fullDescription:
        "Inclination is the angle between the orbital plane of an object and the equatorial plane of the Earth.",
    },
    ra_of_asc_node: {
      value: parseFloat(getParameterByName("ra_of_asc_node")) || 0,
      min: 0,
      max: 360,
      description: "RIGHT ASCENSION",
      fullDescription:
        "Right Ascension of the Ascending Node (RAAN) is the angle from a reference direction to the direction of the ascending node.",
    },
    arg_of_pericenter: {
      value: parseFloat(getParameterByName("arg_of_pericenter")) || 0,
      min: 0,
      max: 360,
      description: "ARGUMENT OF PERIGEE",
      fullDescription:
        "The argument of perigee is the angle from the ascending node to the perigee, measured in the orbital plane.",
    },
    mean_anomaly: {
      value: parseFloat(getParameterByName("mean_anomaly")) || 0,
      min: 0,
      max: 360,
      description: "MEAN ANOMALY",
      fullDescription:
        "Mean Anomaly is the fraction of an orbital period that has elapsed since the last periapsis.",
    },
    use_eccentricity: {
      value: getParameterByName("use_eccentricity") === "true" || false,
      description: "USE ECCENTRICITY",
      fullDescription:
        "Use Eccentricity to determine if the orbit should consider the elliptical shape.",
    },
    eccentricity: {
      value: parseFloat(getParameterByName("eccentricity")) || 0.01,
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
    if (satDataSource.entities.owner._coverageGroup) {
      console.log(satDataSource.entities.owner._coverageGroup);
    }

    if (attributes.use_eccentricity.value) {
      attributes.perigee.value = Math.max(
        (attributes.apogee.value * (1 - attributes.eccentricity.value)) /
          (1 + attributes.eccentricity.value),
        100000
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
      attributes.apogee.value,
      attributes.perigee.value,
      attributes.inclination.value,
      attributes.ra_of_asc_node.value,
      attributes.arg_of_pericenter.value,
      attributes.mean_anomaly.value,
      0.0,
      JulianDate.toIso8601(viewer.clock.currentTime)
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
    viewer.referenceFrame = 1;
    updateURLParams();
    globalThis.SAT = SAT;
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
        width: 4.0,
      });

      viewer.scene.primitives.add(debugPrimitive);
      updateDebugPrimitiveModelMatrix = viewer.clock.onTick.addEventListener(
        () => {
          debugPrimitive.modelMatrix = modelMatrixCallback();
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
  function changeView(view) {
    console.log("Changing view to:", view);
    // Example implementation:
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
          on:change={updateOrbit} />
      {/if}
      {#if key !== "use_eccentricity"}
        {attributes[key].description}
        <button class="info-button" on:click={() => openModal(key)}>?</button>
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
            bind:value={attributes[key].value}
            on:keyup={updateOrbit}
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
            bind:value={attributes[key].value}
            on:input={updateOrbit} />
          <input
            min={attributes[key].min}
            max={attributes[key].max}
            type="number"
            on:keyup={updateOrbit}
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
            bind:value={attributes[key].value}
            on:input={updateOrbit} />
          <input
            min={attributes[key].min}
            max={attributes[key].max}
            type="number"
            bind:value={attributes[key].value}
            on:keyup={updateOrbit}
            style="width:100%;flex: 1; background-color: white; color: black; text-align: center;border-radius:5px;padding-left:15px" />
        </div>
      {/if}
    </label>
  {/each}
  <hr style="margin:10px" />
  <div style="display:flex;gap:5px;align-items:center;justify-items:center">
    <button
      style="background:#333333;color:white;padding:5px; border-radius:5px;margin:auto;width:100%"
      on:click={resetScenario}>RESET TO VERNAL EQUINOX</button>

    <a href="https://gssc.esa.int/navipedia/index.php/Sidereal_Time">
      <button class="info-button">?</button></a>
    <br />
  </div>
</div>

<div class="debug-controls" style="gap:5;display:flex;flex-direction:column">
  <div
    style="display:flex;flex-direction:row;margin:5px;text-align:center;justify-content:space-between;width:100%;">
    <button on:click={() => changeView("3D")} style="flex:1;">3D</button>
    <button on:click={() => changeView("2D")} style="flex:1;">2D</button>
    <button on:click={() => changeView("2.5D")} style="flex:1;">2.5D</button>
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
    width: 12vw;
    min-width: 100px;
    font-size: 0.8rem;
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
</style>
