const migrateDomain = () => {
  if (window.location.hostname === "dxrating.imgg.dev") {
    // prepare local storage
    const localStorageItems = Object.entries(localStorage);
    const packed = JSON.stringify({
      v: 1,
      items: localStorageItems,
    });
    const newUrl = new URL(window.location.href);
    newUrl.hostname = "dxrating.net";
    newUrl.searchParams.set("dxrating-migrate-localstorage", packed);
    localStorage.clear();
    window.location.href = newUrl.href;
  } else {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const packed = searchParams.get("dxrating-migrate-localstorage");
      if (packed) {
        const data = JSON.parse(packed);
        if (data.v === 1) {
          for (const [key, value] of data.items) {
            localStorage.setItem(key, value);
          }
          localStorage.setItem("dxrating-migrated", Date.now().toString());
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete("dxrating-migrate-localstorage");
          window.history.replaceState({}, "", newUrl.href);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
};

migrateDomain();
