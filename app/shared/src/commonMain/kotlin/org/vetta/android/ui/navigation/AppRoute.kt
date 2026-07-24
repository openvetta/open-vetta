package org.vetta.android.ui.navigation

sealed class AppRoute {
    data object Boot : AppRoute()

    data object Welcome : AppRoute()

    data object Login : AppRoute()

    data object ServerSetup : AppRoute()

    data class Chat(val sessionId: String?) : AppRoute()

    data object Me : AppRoute()

    data object Plan : AppRoute()

    data object Settings : AppRoute()
}
