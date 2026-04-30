<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Receipt</title>
<script>
window.onload = function() {
    try {
        var h = window.location.hash;
        if (!h || h.length < 2) return;
        var html = decodeURIComponent(escape(atob(h.slice(1))));
        document.open('text/html', 'replace');
        document.write(html);
        document.close();
    } catch (e) {
        document.body.innerHTML = '<p style="font-family:sans-serif;text-align:center;margin-top:2rem">Receipt unavailable. Please try again.</p>';
    }
};
</script>
</head>
<body></body>
</html>
