"""Small wrappers for Android intents with desktop fallbacks."""

from __future__ import annotations

import webbrowser
from pathlib import Path
from typing import Callable

from kivy.clock import Clock
from kivy.core.clipboard import Clipboard
from kivy.utils import platform

IS_ANDROID = platform == "android"


def copy_text(text: str) -> None:
    Clipboard.copy(text)


def configure_system_ui() -> None:
    """Keep Android system bars dark with readable light icons."""

    if not IS_ANDROID:
        return
    try:
        from jnius import autoclass

        activity = autoclass("org.kivy.android.PythonActivity").mActivity
        window = activity.getWindow()
        color = autoclass("android.graphics.Color").rgb(18, 26, 40)
        window.setStatusBarColor(color)
        window.setNavigationBarColor(color)
        try:
            window.setNavigationBarDividerColor(color)
        except Exception:
            pass
        decor = window.getDecorView()
        # Clear LIGHT_* flags so status/navigation icons remain white.
        decor.setSystemUiVisibility(decor.getSystemUiVisibility() & ~8192 & ~16)
        try:
            controller = window.getInsetsController()
            appearance = autoclass("android.view.WindowInsetsController")
            light_bars = (
                appearance.APPEARANCE_LIGHT_STATUS_BARS
                | appearance.APPEARANCE_LIGHT_NAVIGATION_BARS
            )
            controller.setSystemBarsAppearance(0, light_bars)
        except Exception:
            pass
    except Exception:
        # Styling failure must never prevent the app from opening.
        pass


def system_bar_overlap() -> tuple[int, int]:
    """Pixels of the app surface hidden under the status bar (top) and navigation bar (bottom).

    Apps targeting Android 15 are drawn edge to edge, behind the system bars. The overlap is
    measured against where the content view really sits, so devices that still reserve space
    for the bars report zero instead of getting double padding.
    """
    if not IS_ANDROID:
        return 0, 0
    try:
        from jnius import autoclass

        activity = autoclass("org.kivy.android.PythonActivity").mActivity
        decor = activity.getWindow().getDecorView()
        insets = decor.getRootWindowInsets()
        if insets is not None:
            try:
                types = autoclass("android.view.WindowInsets$Type")
                bars = insets.getInsets(types.systemBars() | types.displayCutout())
                top, bottom = bars.top, bars.bottom
            except Exception:  # Android 10 and older
                top = insets.getSystemWindowInsetTop()
                bottom = insets.getSystemWindowInsetBottom()
        else:
            # During early layout, use the visible display frame as a safe fallback.
            visible = autoclass("android.graphics.Rect")()
            decor.getWindowVisibleDisplayFrame(visible)
            top = max(0, visible.top)
            bottom = max(0, decor.getHeight() - visible.bottom)
        content = activity.findViewById(autoclass("android.R$id").content)
        rect = autoclass("android.graphics.Rect")()
        content.getGlobalVisibleRect(rect)
        screen_bottom = decor.getHeight() - bottom
        return max(0, top - rect.top), max(0, rect.bottom - screen_bottom)
    except Exception:
        return 0, 0


def request_download_permission(callback: Callable[[bool], None]) -> None:
    """Request legacy storage access only where public Downloads requires it."""

    if not IS_ANDROID:
        callback(True)
        return
    from jnius import autoclass

    if autoclass("android.os.Build$VERSION").SDK_INT >= 29:
        callback(True)
        return
    from android.permissions import Permission, check_permission, request_permissions

    permission = Permission.WRITE_EXTERNAL_STORAGE
    if check_permission(permission):
        callback(True)
        return

    def finished(_permissions, grants):
        granted = bool(grants) and all(bool(value) for value in grants)
        Clock.schedule_once(lambda *_: callback(granted), 0)

    request_permissions([permission], finished)


def publish_to_downloads(source: str | Path, display_name: str, mime_type: str) -> str:
    """Copy a private report into public Download/KosSplit and return its content URI."""

    if not IS_ANDROID:
        return Path(source).resolve().as_uri()

    from jnius import autoclass

    activity = autoclass("org.kivy.android.PythonActivity").mActivity
    resolver = activity.getContentResolver()
    values = autoclass("android.content.ContentValues")()
    media = autoclass("android.provider.MediaStore$MediaColumns")
    values.put(media.DISPLAY_NAME, display_name)
    values.put(media.MIME_TYPE, mime_type)
    sdk = autoclass("android.os.Build$VERSION").SDK_INT

    if sdk >= 29:
        downloads = autoclass("android.provider.MediaStore$Downloads")
        values.put(media.RELATIVE_PATH, "Download/KosSplit")
        values.put(media.IS_PENDING, 1)
        collection = downloads.EXTERNAL_CONTENT_URI
    else:
        environment = autoclass("android.os.Environment")
        folder = Path(str(environment.getExternalStoragePublicDirectory(environment.DIRECTORY_DOWNLOADS)))
        destination = folder / "KosSplit" / display_name
        autoclass("java.io.File")(str(destination.parent)).mkdirs()
        values.put(media.DATA, str(destination))
        collection = autoclass("android.provider.MediaStore$Files").getContentUri("external")

    uri = resolver.insert(collection, values)
    if uri is None:
        raise OSError("Android tidak dapat membuat file di folder Download")
    stream = None
    source_stream = None
    source_channel = None
    target_channel = None
    try:
        stream = resolver.openOutputStream(uri, "w")
        if stream is None:
            raise OSError("Android tidak dapat membuka file laporan")
        source_stream = autoclass("java.io.FileInputStream")(str(Path(source)))
        source_channel = source_stream.getChannel()
        target_channel = autoclass("java.nio.channels.Channels").newChannel(stream)
        size = source_channel.size()
        position = 0
        while position < size:
            written = source_channel.transferTo(position, size - position, target_channel)
            if written <= 0:
                raise OSError("Penyalinan laporan ke folder Download terhenti")
            position += written
        target_channel.close()
        target_channel = None
        stream = None
        source_channel.close()
        source_channel = None
        source_stream.close()
        source_stream = None
        if sdk >= 29:
            ready = autoclass("android.content.ContentValues")()
            ready.put(media.IS_PENDING, 0)
            resolver.update(uri, ready, None, None)
    except Exception:
        if target_channel is not None:
            target_channel.close()
        if stream is not None:
            stream.close()
        if source_channel is not None:
            source_channel.close()
        if source_stream is not None:
            source_stream.close()
        resolver.delete(uri, None, None)
        raise
    return uri.toString()


def open_document(uri_text: str, mime_type: str) -> bool:
    """Open a published report, falling back to Android's share chooser."""

    if not IS_ANDROID:
        return open_url(uri_text)
    from jnius import autoclass

    activity = autoclass("org.kivy.android.PythonActivity").mActivity
    intent_class = autoclass("android.content.Intent")
    uri = autoclass("android.net.Uri").parse(uri_text)
    flags = intent_class.FLAG_GRANT_READ_URI_PERMISSION | intent_class.FLAG_ACTIVITY_NEW_TASK
    view = intent_class(intent_class.ACTION_VIEW)
    view.setDataAndType(uri, mime_type)
    view.addFlags(flags)
    try:
        activity.startActivity(view)
        return True
    except Exception:
        share = intent_class(intent_class.ACTION_SEND)
        share.setType(mime_type)
        share.putExtra(intent_class.EXTRA_STREAM, uri)
        share.setClipData(autoclass("android.content.ClipData").newRawUri("KosSplit", uri))
        share.addFlags(flags)
        try:
            chooser = intent_class.createChooser(share, "Buka atau bagikan laporan KosSplit")
            chooser.addFlags(intent_class.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(chooser)
            return True
        except Exception:
            return False


def open_url(url: str) -> bool:
    if not IS_ANDROID:
        return webbrowser.open(url)
    from jnius import autoclass

    Intent = autoclass("android.content.Intent")
    Uri = autoclass("android.net.Uri")
    PythonActivity = autoclass("org.kivy.android.PythonActivity")
    intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
    try:
        PythonActivity.mActivity.startActivity(intent)
        return True
    except Exception:
        return False


def open_app(package: str) -> bool:
    """Open an installed app by package, or its Play Store page when missing.

    Uses an explicit launcher intent so Android 11 package visibility rules do
    not require a <queries> manifest entry.
    """
    if not IS_ANDROID:
        return False
    from jnius import autoclass

    Intent = autoclass("android.content.Intent")
    PythonActivity = autoclass("org.kivy.android.PythonActivity")
    intent = Intent(Intent.ACTION_MAIN)
    intent.addCategory(Intent.CATEGORY_LAUNCHER)
    intent.setPackage(package)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try:
        PythonActivity.mActivity.startActivity(intent)
        return True
    except Exception:
        return open_url(f"market://details?id={package}") or open_url(
            f"https://play.google.com/store/apps/details?id={package}"
        )
