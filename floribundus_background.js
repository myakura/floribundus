async function sortSelectedTabsByUrl() {
	const tabs = await browser.tabs.query({ currentWindow: true, highlighted: true });
	console.log(`floribundus: tabs obtained: ${tabs}`);
	const sortedTabs = tabs.sort((a, b) => a.url.localeCompare(b.url));
	for (let i = 0; i < sortedTabs.length; i++) {
		await browser.tabs.move(sortedTabs[i].id, { index: i });
	}
}

browser.browserAction.onClicked.addListener(async () => {
	await sortSelectedTabsByUrl();
});
