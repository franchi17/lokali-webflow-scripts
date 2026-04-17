# Lokali Webflow Scripts

Browser scripts loaded by [golokali.com](https://golokali.com) (Webflow site)
via [jsDelivr](https://www.jsdelivr.com/).

Files in `scripts/` are loaded into Webflow as `<script src="...">` tags using
URLs of the form:

```
https://cdn.jsdelivr.net/gh/<USER>/lokali-webflow-scripts@main/scripts/<file>.js
```

These files contain **no secrets**. All authenticated requests use a per-user
token issued by the backend (Xano) after Clerk sign-in.
