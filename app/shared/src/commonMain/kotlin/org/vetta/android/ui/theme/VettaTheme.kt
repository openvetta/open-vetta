package org.vetta.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import org.vetta.android.app.ThemeMode

private val VettaLight =
    lightColorScheme(
        primary = Color(0xFF1F4B99),
        onPrimary = Color.White,
        primaryContainer = Color(0xFFD6E3FF),
        onPrimaryContainer = Color(0xFF001B3F),
        secondary = Color(0xFF545F71),
        onSecondary = Color.White,
        secondaryContainer = Color(0xFFD8E3F8),
        onSecondaryContainer = Color(0xFF111C2B),
        tertiary = Color(0xFF6B5778),
        background = Color(0xFFF8F9FC),
        onBackground = Color(0xFF191C20),
        surface = Color(0xFFF8F9FC),
        onSurface = Color(0xFF191C20),
        surfaceVariant = Color(0xFFE1E2EC),
        onSurfaceVariant = Color(0xFF44474F),
        outline = Color(0xFF74777F),
        error = Color(0xFFBA1A1A),
        onError = Color.White,
        errorContainer = Color(0xFFFFDAD6),
        onErrorContainer = Color(0xFF410002),
    )

private val VettaDark =
    darkColorScheme(
        primary = Color(0xFFA9C7FF),
        onPrimary = Color(0xFF003064),
        primaryContainer = Color(0xFF003F8C),
        onPrimaryContainer = Color(0xFFD6E3FF),
        secondary = Color(0xFFBCC7DB),
        onSecondary = Color(0xFF263141),
        secondaryContainer = Color(0xFF3C4758),
        onSecondaryContainer = Color(0xFFD8E3F8),
        tertiary = Color(0xFFD6BEE4),
        background = Color(0xFF111318),
        onBackground = Color(0xFFE2E2E9),
        surface = Color(0xFF111318),
        onSurface = Color(0xFFE2E2E9),
        surfaceVariant = Color(0xFF44474F),
        onSurfaceVariant = Color(0xFFC4C6D0),
        outline = Color(0xFF8E9099),
        error = Color(0xFFFFB4AB),
        onError = Color(0xFF690005),
        errorContainer = Color(0xFF93000A),
        onErrorContainer = Color(0xFFFFDAD6),
    )

@Composable
fun VettaTheme(
    themeMode: ThemeMode,
    content: @Composable () -> Unit,
) {
    val dark =
        when (themeMode) {
            ThemeMode.System -> isSystemInDarkTheme()
            ThemeMode.Light -> false
            ThemeMode.Dark -> true
        }
    MaterialTheme(
        colorScheme = if (dark) VettaDark else VettaLight,
        content = content,
    )
}
