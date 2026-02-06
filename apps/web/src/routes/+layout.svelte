<script lang="ts">
	import '../app.css';

	const { children } = $props();
</script>

<div class="h-screen w-full">
	{@render children()}
</div>
