package org.vetta.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import org.vetta.android.app.AppContainer
import org.vetta.android.domain.session.SessionStore
import org.vetta.android.ui.auth.LoginScreen
import org.vetta.android.ui.auth.ServerSetupScreen
import org.vetta.android.ui.auth.WelcomeScreen
import org.vetta.android.ui.chat.ChatScreen
import org.vetta.android.ui.components.LoadingBlock
import org.vetta.android.ui.me.MeScreen
import org.vetta.android.ui.me.PlanScreen
import org.vetta.android.ui.navigation.AppRoute
import org.vetta.android.ui.sessions.SessionsDrawerContent
import org.vetta.android.ui.settings.SettingsScreen
import org.vetta.android.ui.theme.VettaTheme
import kotlin.reflect.KClass

val LocalAppContainer =
    staticCompositionLocalOf<AppContainer> {
        error("AppContainer not provided")
    }

private class AppViewModelFactory(
    private val container: AppContainer,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(
        modelClass: KClass<T>,
        extras: CreationExtras,
    ): T = AppViewModel(container) as T
}

@Composable
fun RootApp(container: AppContainer = LocalAppContainer.current) {
    val vm: AppViewModel =
        viewModel(
            factory = remember(container) { AppViewModelFactory(container) },
        )
    val state by vm.state.collectAsState()
    val sessions by vm.sessions.collectAsState()

    VettaTheme(themeMode = state.themeMode) {
        if (!state.bootstrapped || state.route is AppRoute.Boot) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                LoadingBlock()
            }
            return@VettaTheme
        }

        when (val route = state.route) {
            AppRoute.Boot -> Unit
            AppRoute.Welcome ->
                WelcomeScreen(
                    onLogin = vm::openLogin,
                    onServerSetup = vm::openServerSetup,
                )
            AppRoute.Login ->
                LoginScreen(
                    loading = state.authLoading,
                    error = state.authError,
                    loginModeEmail = state.loginModeEmail,
                    passwordVisible = state.passwordVisible,
                    serverUrl = state.serverUrl,
                    onToggleMode = vm::setLoginModeEmail,
                    onTogglePassword = vm::setPasswordVisible,
                    onLogin = vm::login,
                    onServerSetup = vm::openServerSetup,
                    onClearError = vm::clearAuthError,
                    onBack = vm::openWelcome,
                )
            AppRoute.ServerSetup ->
                ServerSetupScreen(
                    serverUrl = state.serverUrl,
                    onSave = vm::saveServerUrl,
                    onBack = {
                        if (state.user != null) vm.openSettings() else vm.openWelcome()
                    },
                )
            is AppRoute.Chat -> {
                val drawerState = rememberDrawerState(DrawerValue.Closed)
                val scope = rememberCoroutineScope()
                var sessionQuery by remember { mutableStateOf("") }

                LaunchedEffect(state.sessionsDrawerOpen) {
                    if (state.sessionsDrawerOpen) drawerState.open() else drawerState.close()
                }
                LaunchedEffect(drawerState.currentValue) {
                    val open = drawerState.currentValue == DrawerValue.Open
                    if (open != state.sessionsDrawerOpen) {
                        vm.setDrawer(open)
                    }
                }

                ModalNavigationDrawer(
                    drawerState = drawerState,
                    drawerContent = {
                        SessionsDrawerContent(
                            sessions = sessions,
                            currentSessionId = state.currentSessionId,
                            query = sessionQuery,
                            onQueryChange = { sessionQuery = it },
                            onNewChat = {
                                vm.newChat()
                                scope.launch { drawerState.close() }
                            },
                            onOpenSession = { id ->
                                vm.openChat(id)
                                scope.launch { drawerState.close() }
                            },
                            onDeleteSession = vm::deleteSession,
                            onRenameSession = vm::renameSession,
                        )
                    },
                ) {
                    val selected =
                        state.models.firstOrNull { it.id == state.selectedModelId }
                            ?: state.models.firstOrNull()
                    val title =
                        sessions.firstOrNull { it.id == state.currentSessionId }?.title
                            ?: SessionStore.DEFAULT_TITLE

                    ChatScreen(
                        title = title,
                        messages = state.messages,
                        draft = state.draft,
                        pendingImages = state.pendingImages,
                        isStreaming = state.isStreaming,
                        models = state.models,
                        selectedModel = selected,
                        modelPickerOpen = state.modelPickerOpen,
                        globalError = state.globalError,
                        onDraftChange = vm::onDraftChange,
                        onSend = vm::sendMessage,
                        onStop = vm::stopStreaming,
                        onOpenDrawer = { vm.setDrawer(true) },
                        onOpenMe = vm::openMe,
                        onNewChat = vm::newChat,
                        onOpenModelPicker = { vm.setModelPicker(true) },
                        onCloseModelPicker = { vm.setModelPicker(false) },
                        onSelectModel = vm::selectModel,
                        onErrorAction = vm::handleErrorAction,
                        onDismissError = vm::clearGlobalError,
                        onSuggestion = { tip ->
                            vm.onDraftChange(tip)
                        },
                        onImagesPicked = vm::addPendingImages,
                        onRemovePendingImage = vm::removePendingImage,
                    )
                }
            }
            AppRoute.Me ->
                MeScreen(
                    user = state.user,
                    subscription = state.subscription,
                    onBack = vm::navigateBackFromSecondary,
                    onOpenPlan = vm::openPlan,
                    onOpenSettings = vm::openSettings,
                    onLogout = vm::logout,
                )
            AppRoute.Plan ->
                PlanScreen(
                    subscription = state.subscription,
                    onBack = vm::navigateBackFromSecondary,
                    onRefresh = vm::refreshCatalog,
                )
            AppRoute.Settings ->
                SettingsScreen(
                    themeMode = state.themeMode,
                    serverUrl = state.serverUrl,
                    onThemeMode = vm::setThemeMode,
                    onOpenServer = vm::openServerSetup,
                    onBack = vm::navigateBackFromSecondary,
                )
        }
    }
}
