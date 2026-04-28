<script lang="ts">
	import '../app.css';
	import { Tooltip } from 'bits-ui';

	const { children } = $props();
</script>

<Tooltip.Provider delayDuration={200}>
	<div class="h-screen w-full">
		{@render children()}
	</div>
</Tooltip.Provider>
