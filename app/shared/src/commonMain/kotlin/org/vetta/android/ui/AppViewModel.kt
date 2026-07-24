package org.vetta.android.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.vetta.android.app.AppContainer
import org.vetta.android.app.ThemeMode
import org.vetta.android.core.model.ChatRole
import org.vetta.android.core.model.ChatStreamEvent
import org.vetta.android.core.model.LlmModel
import org.vetta.android.core.model.SubscriptionStatus
import org.vetta.android.core.model.User
import org.vetta.android.core.net.RefreshOutcome
import org.vetta.android.domain.chat.prepareRetryTurn
import org.vetta.android.domain.chat.shouldClearPendingImagesOnSessionChange
import org.vetta.android.domain.error.ErrorMapper
import org.vetta.android.domain.error.UiError
import org.vetta.android.domain.error.UiErrorAction
import org.vetta.android.domain.session.LocalMessage
import org.vetta.android.domain.session.MessageImage
import org.vetta.android.domain.session.MessageStatus
import org.vetta.android.domain.session.SessionStore
import org.vetta.android.domain.session.nowEpochMs
import org.vetta.android.ui.i18n.Str
import org.vetta.android.ui.navigation.AppRoute
import kotlin.random.Random

data class AppUiState(
    val bootstrapped: Boolean = false,
    val route: AppRoute = AppRoute.Boot,
    val themeMode: ThemeMode = ThemeMode.System,
    val serverUrl: String = "",
    val user: User? = null,
    val subscription: SubscriptionStatus? = null,
    val models: List<LlmModel> = emptyList(),
    val selectedModelId: String? = null,
    val currentSessionId: String? = null,
    val messages: List<LocalMessage> = emptyList(),
    val draft: String = "",
    val pendingImages: List<MessageImage> = emptyList(),
    val isStreaming: Boolean = false,
    val sessionsDrawerOpen: Boolean = false,
    val modelPickerOpen: Boolean = false,
    val globalError: UiError? = null,
    val authError: UiError? = null,
    val authLoading: Boolean = false,
    val loginModeEmail: Boolean = true,
    val catalogLoading: Boolean = false,
    val passwordVisible: Boolean = false,
)

class AppViewModel(
    private val container: AppContainer,
) : ViewModel() {
    private val _state =
        MutableStateFlow(
            AppUiState(
                themeMode = container.preferences.themeMode.value,
                serverUrl = container.preferences.serverUrl.value,
            ),
        )
    val state: StateFlow<AppUiState> = _state.asStateFlow()

    private var streamJob: Job? = null
    private var messagesCollectJob: Job? = null
    private val drafts = mutableMapOf<String, String>()

    init {
        viewModelScope.launch {
            combine(
                container.preferences.themeMode,
                container.preferences.serverUrl,
            ) { theme, server -> theme to server }
                .collect { (theme, server) ->
                    _state.update { it.copy(themeMode = theme, serverUrl = server) }
                }
        }
        viewModelScope.launch {
            container.unauthorizedEpoch.collect { epoch ->
                if (epoch > 0) {
                    forceLogout(keepLocalSessions = true, message = "登录已失效，请重新登录")
                }
            }
        }
        bootstrap()
    }

    private fun bootstrap() {
        viewModelScope.launch {
            val loggedIn = container.tokenStore.accessToken != null
            if (!loggedIn) {
                _state.update {
                    it.copy(bootstrapped = true, route = AppRoute.Welcome)
                }
                return@launch
            }
            when (val refresh = container.client.auth.refresh()) {
                is RefreshOutcome.Ok, RefreshOutcome.Transient -> {
                    // Transient：保留会话，尽量拉用户信息
                    loadWorkspace(openLastSession = true)
                }
                RefreshOutcome.Unauthorized -> {
                    container.tokenStore.clear()
                    _state.update {
                        it.copy(
                            bootstrapped = true,
                            route = AppRoute.Login,
                            authError =
                                UiError(
                                    title = "需要重新登录",
                                    message = "登录已失效，请重新登录",
                                    action = UiErrorAction.None,
                                ),
                        )
                    }
                }
            }
        }
    }

    private suspend fun loadWorkspace(openLastSession: Boolean) {
        _state.update { it.copy(catalogLoading = true, globalError = null) }
        try {
            val user = runCatching { container.client.auth.me() }.getOrNull()
            val sub = runCatching { container.client.subscription.me() }.getOrNull()
            val models =
                runCatching { container.client.models.listGoModels() }
                    .getOrElse { emptyList() }
            val selected =
                resolveModelId(
                    preferred = container.preferences.lastModelId,
                    models = models,
                )
            val lastSessionId = container.preferences.lastSessionId
            val routeSession =
                if (openLastSession && lastSessionId != null &&
                    container.sessionStore.getSession(lastSessionId) != null
                ) {
                    lastSessionId
                } else {
                    null
                }
            _state.update {
                it.copy(
                    bootstrapped = true,
                    user = user,
                    subscription = sub,
                    models = models,
                    selectedModelId = selected,
                    route = AppRoute.Chat(routeSession),
                    currentSessionId = routeSession,
                    catalogLoading = false,
                )
            }
            if (routeSession != null) {
                attachSession(routeSession)
            }
        } catch (t: Throwable) {
            _state.update {
                it.copy(
                    bootstrapped = true,
                    catalogLoading = false,
                    route = AppRoute.Chat(null),
                    globalError = ErrorMapper.from(t),
                )
            }
        }
    }

    fun openWelcome() = navigate(AppRoute.Welcome)

    fun openLogin() = navigate(AppRoute.Login)

    fun openServerSetup() = navigate(AppRoute.ServerSetup)

    fun openMe() = navigate(AppRoute.Me)

    fun openPlan() = navigate(AppRoute.Plan)

    fun openSettings() = navigate(AppRoute.Settings)

    fun openChat(sessionId: String?) {
        val previousSessionId = _state.value.currentSessionId
        val clearPending =
            shouldClearPendingImagesOnSessionChange(previousSessionId, sessionId)
        navigate(AppRoute.Chat(sessionId))
        if (sessionId != null) {
            attachSession(sessionId, clearPendingImages = clearPending)
        } else {
            detachSessionMessages()
            _state.update {
                it.copy(
                    currentSessionId = null,
                    messages = emptyList(),
                    draft = "",
                    pendingImages = if (clearPending) emptyList() else it.pendingImages,
                )
            }
        }
        setDrawer(false)
    }

    fun navigateBackFromSecondary() {
        val sessionId = _state.value.currentSessionId
        navigate(AppRoute.Chat(sessionId))
    }

    private fun navigate(route: AppRoute) {
        _state.update { it.copy(route = route, authError = null) }
    }

    fun setDrawer(open: Boolean) {
        _state.update { it.copy(sessionsDrawerOpen = open) }
    }

    fun setModelPicker(open: Boolean) {
        _state.update { it.copy(modelPickerOpen = open) }
    }

    fun setLoginModeEmail(email: Boolean) {
        _state.update { it.copy(loginModeEmail = email) }
    }

    fun setPasswordVisible(visible: Boolean) {
        _state.update { it.copy(passwordVisible = visible) }
    }

    fun clearAuthError() {
        _state.update { it.copy(authError = null) }
    }

    fun clearGlobalError() {
        _state.update { it.copy(globalError = null) }
    }

    fun onDraftChange(value: String) {
        val sid = _state.value.currentSessionId
        if (sid != null) drafts[sid] = value
        _state.update { it.copy(draft = value) }
    }

    fun addPendingImages(images: List<MessageImage>) {
        if (images.isEmpty()) return
        _state.update { state ->
            state.copy(pendingImages = (state.pendingImages + images).distinctBy { it.id }.take(6))
        }
    }

    fun removePendingImage(id: String) {
        _state.update { it.copy(pendingImages = it.pendingImages.filterNot { img -> img.id == id }) }
    }

    fun selectModel(model: LlmModel) {
        container.preferences.lastModelId = model.id
        _state.update { it.copy(selectedModelId = model.id, modelPickerOpen = false) }
        val sid = _state.value.currentSessionId
        if (sid != null) {
            viewModelScope.launch {
                val session = container.sessionStore.getSession(sid) ?: return@launch
                container.sessionStore.updateSession(
                    session.copy(modelId = model.id, modelName = model.name),
                )
            }
        }
    }

    fun setThemeMode(mode: ThemeMode) {
        container.preferences.setThemeMode(mode)
    }

    fun saveServerUrl(url: String) {
        viewModelScope.launch {
            try {
                container.preferences.setServerUrl(url)
                container.recreateClient(url.trim().trimEnd('/'))
                _state.update {
                    it.copy(
                        serverUrl = url.trim().trimEnd('/'),
                        globalError = null,
                    )
                }
                if (container.tokenStore.accessToken != null) {
                    loadWorkspace(openLastSession = true)
                } else {
                    navigate(AppRoute.Login)
                }
            } catch (t: Throwable) {
                _state.update { it.copy(globalError = ErrorMapper.from(t)) }
            }
        }
    }

    fun login(accountOrEmail: String, password: String) {
        viewModelScope.launch {
            _state.update { it.copy(authLoading = true, authError = null) }
            try {
                if (_state.value.loginModeEmail) {
                    container.client.auth.loginWithEmailPassword(accountOrEmail, password)
                } else {
                    container.client.auth.loginWithAccount(accountOrEmail, password)
                }
                loadWorkspace(openLastSession = true)
            } catch (t: Throwable) {
                _state.update {
                    it.copy(authLoading = false, authError = ErrorMapper.from(t))
                }
                return@launch
            }
            _state.update { it.copy(authLoading = false) }
        }
    }

    fun logout(clearLocalSessions: Boolean) {
        viewModelScope.launch {
            streamJob?.cancel()
            runCatching { container.client.auth.logout() }
            forceLogout(keepLocalSessions = !clearLocalSessions)
        }
    }

    private suspend fun forceLogout(keepLocalSessions: Boolean, message: String? = null) {
        streamJob?.cancel()
        container.tokenStore.clear()
        if (!keepLocalSessions) {
            container.sessionStore.sessions.value.map { it.id }.forEach {
                container.sessionStore.deleteSession(it)
            }
        }
        drafts.clear()
        container.preferences.lastSessionId = null
        _state.update {
            it.copy(
                user = null,
                subscription = null,
                models = emptyList(),
                selectedModelId = null,
                currentSessionId = null,
                messages = emptyList(),
                draft = "",
                pendingImages = emptyList(),
                isStreaming = false,
                route = AppRoute.Login,
                sessionsDrawerOpen = false,
                modelPickerOpen = false,
                authError =
                    message?.let {
                        UiError(title = "已退出", message = it, action = UiErrorAction.None)
                    },
            )
        }
    }

    fun refreshCatalog() {
        viewModelScope.launch {
            _state.update { it.copy(catalogLoading = true) }
            try {
                val sub = container.client.subscription.me()
                val models = container.client.models.listGoModels()
                val selected =
                    resolveModelId(_state.value.selectedModelId ?: container.preferences.lastModelId, models)
                _state.update {
                    it.copy(
                        subscription = sub,
                        models = models,
                        selectedModelId = selected,
                        catalogLoading = false,
                        globalError = null,
                    )
                }
            } catch (t: Throwable) {
                _state.update {
                    it.copy(catalogLoading = false, globalError = ErrorMapper.from(t))
                }
            }
        }
    }

    fun newChat() {
        viewModelScope.launch {
            streamJob?.cancel()
            val model = currentModel()
            val session =
                container.sessionStore.createSession(
                    title = SessionStore.DEFAULT_TITLE,
                    modelId = model?.id,
                    modelName = model?.name,
                )
            container.preferences.lastSessionId = session.id
            drafts[session.id] = ""
            _state.update { it.copy(pendingImages = emptyList()) }
            openChat(session.id)
        }
    }

    fun deleteSession(sessionId: String) {
        viewModelScope.launch {
            if (_state.value.currentSessionId == sessionId) {
                streamJob?.cancel()
            }
            container.sessionStore.deleteSession(sessionId)
            drafts.remove(sessionId)
            if (container.preferences.lastSessionId == sessionId) {
                container.preferences.lastSessionId = null
            }
            if (_state.value.currentSessionId == sessionId) {
                openChat(null)
            }
        }
    }

    fun renameSession(sessionId: String, title: String) {
        viewModelScope.launch {
            val session = container.sessionStore.getSession(sessionId) ?: return@launch
            val cleaned = title.trim().ifBlank { SessionStore.DEFAULT_TITLE }
            container.sessionStore.updateSession(session.copy(title = cleaned))
        }
    }

    fun sendMessage() {
        val text = _state.value.draft.trim()
        val images = _state.value.pendingImages
        if ((text.isEmpty() && images.isEmpty()) || _state.value.isStreaming) return
        val model = currentModel()
        if (model == null) {
            _state.update {
                it.copy(
                    globalError =
                        UiError(
                            title = Str.noModels,
                            message = Str.noModelsHint,
                            action = UiErrorAction.OpenPlan,
                        ),
                )
            }
            return
        }

        viewModelScope.launch {
            var sessionId = _state.value.currentSessionId
            if (sessionId == null) {
                val session =
                    container.sessionStore.createSession(
                        modelId = model.id,
                        modelName = model.name,
                    )
                sessionId = session.id
                container.preferences.lastSessionId = sessionId
                attachSession(sessionId)
                _state.update {
                    it.copy(
                        currentSessionId = sessionId,
                        route = AppRoute.Chat(sessionId),
                    )
                }
            }

            val sid = sessionId
            val userMsg =
                LocalMessage(
                    id = newMessageId(),
                    sessionId = sid,
                    role = ChatRole.User,
                    content = text,
                    status = MessageStatus.Complete,
                    createdAtEpochMs = nowEpochMs(),
                    images = images,
                )
            val assistantId = newMessageId()
            val assistantMsg =
                LocalMessage(
                    id = assistantId,
                    sessionId = sid,
                    role = ChatRole.Assistant,
                    content = "",
                    status = MessageStatus.Streaming,
                    createdAtEpochMs = nowEpochMs() + 1,
                )
            container.sessionStore.upsertMessage(userMsg)
            container.sessionStore.upsertMessage(assistantMsg)
            drafts[sid] = ""
            _state.update {
                it.copy(draft = "", pendingImages = emptyList(), isStreaming = true, globalError = null)
            }

            val history =
                container.sessionStore
                    .getMessages(sid)
                    .filter {
                        it.id != assistantId &&
                            it.status != MessageStatus.Error &&
                            it.hasVisualContent
                    }.map { it.toChatMessage() }

            streamJob?.cancel()
            streamJob =
                viewModelScope.launch {
                    var assembled = ""
                    try {
                        container.client.chat
                            .stream(model = model.id, messages = history)
                            .collect { event ->
                                when (event) {
                                    is ChatStreamEvent.Delta -> {
                                        assembled += event.text
                                        container.sessionStore.upsertMessage(
                                            assistantMsg.copy(
                                                content = assembled,
                                                status = MessageStatus.Streaming,
                                            ),
                                        )
                                    }
                                    is ChatStreamEvent.Finished -> Unit
                                    ChatStreamEvent.Done -> {
                                        container.sessionStore.upsertMessage(
                                            assistantMsg.copy(
                                                content = assembled,
                                                status = MessageStatus.Complete,
                                            ),
                                        )
                                    }
                                    is ChatStreamEvent.Error -> {
                                        val ui = ErrorMapper.from(event.exception)
                                        container.sessionStore.upsertMessage(
                                            assistantMsg.copy(
                                                content = assembled,
                                                status = MessageStatus.Error,
                                                errorMessage = ui.message,
                                            ),
                                        )
                                        _state.update { it.copy(globalError = ui) }
                                    }
                                }
                            }
                        // 正常结束后若仍 streaming 则 complete
                        val latest =
                            container.sessionStore.getMessages(sid).firstOrNull { it.id == assistantId }
                        if (latest?.status == MessageStatus.Streaming) {
                            container.sessionStore.upsertMessage(
                                latest.copy(status = MessageStatus.Complete),
                            )
                        }
                    } catch (t: Throwable) {
                        val ui = ErrorMapper.from(t)
                        val latest =
                            container.sessionStore.getMessages(sid).firstOrNull { it.id == assistantId }
                        if (latest != null) {
                            container.sessionStore.upsertMessage(
                                latest.copy(
                                    status =
                                        if (t is kotlinx.coroutines.CancellationException) {
                                            MessageStatus.Aborted
                                        } else {
                                            MessageStatus.Error
                                        },
                                    errorMessage = if (t is kotlinx.coroutines.CancellationException) null else ui.message,
                                ),
                            )
                        }
                        if (t !is kotlinx.coroutines.CancellationException) {
                            _state.update { it.copy(globalError = ui) }
                        }
                    } finally {
                        _state.update { it.copy(isStreaming = false) }
                    }
                }
        }
    }

    fun stopStreaming() {
        streamJob?.cancel()
        streamJob = null
        val sid = _state.value.currentSessionId ?: return
        viewModelScope.launch {
            val streaming =
                container.sessionStore.getMessages(sid).lastOrNull {
                    it.role == ChatRole.Assistant && it.status == MessageStatus.Streaming
                }
            if (streaming != null) {
                container.sessionStore.upsertMessage(streaming.copy(status = MessageStatus.Aborted))
            }
            _state.update { it.copy(isStreaming = false) }
        }
    }

    fun retryLastError() {
        val sid = _state.value.currentSessionId ?: return
        viewModelScope.launch {
            val messages = container.sessionStore.getMessages(sid)
            val turn = prepareRetryTurn(messages) ?: return@launch
            container.sessionStore.replaceMessages(sid, turn.remainingMessages)
            drafts[sid] = turn.draft
            // 必须同时恢复图片；否则纯图重试会变成 no-op，图文重试会丢图
            _state.update {
                it.copy(
                    draft = turn.draft,
                    pendingImages = turn.images,
                    globalError = null,
                )
            }
            sendMessage()
        }
    }

    fun handleErrorAction(action: UiErrorAction) {
        when (action) {
            UiErrorAction.Retry -> {
                clearGlobalError()
                if (_state.value.route is AppRoute.Chat) retryLastError() else refreshCatalog()
            }
            UiErrorAction.OpenPlan -> {
                clearGlobalError()
                openPlan()
            }
            UiErrorAction.ReLogin -> {
                clearGlobalError()
                viewModelScope.launch { forceLogout(keepLocalSessions = true) }
            }
            UiErrorAction.OpenSettings -> {
                clearGlobalError()
                openSettings()
            }
            UiErrorAction.None -> clearGlobalError()
        }
    }

    val sessions =
        container.sessionStore.sessions
            .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    private fun attachSession(
        sessionId: String,
        clearPendingImages: Boolean = true,
    ) {
        messagesCollectJob?.cancel()
        container.preferences.lastSessionId = sessionId
        val draft = drafts[sessionId].orEmpty()
        _state.update {
            it.copy(
                currentSessionId = sessionId,
                draft = draft,
                pendingImages = if (clearPendingImages) emptyList() else it.pendingImages,
            )
        }
        messagesCollectJob =
            viewModelScope.launch {
                container.sessionStore.observeMessages(sessionId).collect { list ->
                    _state.update { state -> state.copy(messages = list) }
                }
            }
    }

    private fun detachSessionMessages() {
        messagesCollectJob?.cancel()
        messagesCollectJob = null
    }

    private fun currentModel(): LlmModel? {
        val id = _state.value.selectedModelId
        return _state.value.models.firstOrNull { it.id == id } ?: _state.value.models.firstOrNull()
    }

    private fun resolveModelId(preferred: String?, models: List<LlmModel>): String? {
        if (models.isEmpty()) return null
        if (preferred != null && models.any { it.id == preferred }) return preferred
        return models.first().id
    }

    private fun newMessageId(): String =
        "${nowEpochMs().toString(16)}-${Random.nextInt(0, Int.MAX_VALUE).toString(16)}"
}
