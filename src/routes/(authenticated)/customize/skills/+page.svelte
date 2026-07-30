<script lang="ts">
  import SkillManager from "$lib/components/skills/SkillManager.svelte";
</script>

<div class="space-y-6">
  <p class="text-sm text-muted-foreground">
    Reusable instructions the agent loads on demand when a skill is invoked.
  </p>
  <SkillManager />
</div>
