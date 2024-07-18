<script>
  import { onMount } from "svelte";
  import "./style.css";
  import "orbpro/style/widgets.css";
  import { Viewer } from "orbpro";

  onMount(() => {
    const viewer = new Viewer("orbpro");
  });
</script>

<div id="orbpro"></div>

<style>
  #orbpro{
    width:100vw;
    height:100vh;
  }
</style>
