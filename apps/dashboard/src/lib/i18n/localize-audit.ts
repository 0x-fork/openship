/**
 * Localization helper and translations for Audit Log events.
 * Maps event types and descriptions to active locale phrases.
 */

export interface AuditEventCopy {
	action: string;
	label: string;
	description?: string;
	actionWithoutResource?: string;
}

export type AuditDictionary = Record<
	string,
	{
		action: string;
		label: string;
		description?: string;
		actionWithoutResource?: string;
	}
>;

const AUDIT_TRANSLATIONS: Record<string, AuditDictionary> = {
	ru: {
		"project.updated": {
			label: "Приложение обновлено",
			action: "обновил",
			description:
				"Настройки, сервисы, переменные окружения или маршрутизация были изменены.",
		},
		"project.created": {
			label: "Приложение создано",
			action: "создал",
			description: "Создано новое приложение и его конфигурация.",
		},
		"project.deleted": {
			label: "Приложение удалено",
			action: "удалил",
			description: "Приложение и его рабочие нагрузки были удалены.",
		},
		"project.deletion.failed": {
			label: "Ошибка удаления приложения",
			action: "не смог удалить",
			description:
				"Очистка не завершилась, поэтому запись приложения сохранена для безопасного повтора.",
		},
		"project.deletion.rejected": {
			label: "В удалении приложения отказано",
			action: "попытался удалить",
			description:
				"В удалении отказано — другие ресурсы всё ещё зависят от этого приложения.",
		},
		"project.build_cache.cleared": {
			label: "Кэш сборки очищен",
			action: "очистил кэш сборки Docker для",
			description:
				"Неиспользуемый кэш сборки удалён с Docker-хоста приложения.",
		},
		"project:write": {
			label: "Приложение изменено",
			action: "изменил",
			description: "Один из эндпоинтов записи приложения был вызван.",
		},
		"project:admin": {
			label: "Действие администратора приложения",
			action: "выполнил действие администратора над",
			description:
				"Вызвано деструктивное действие приложения (удаление или перенос).",
		},
		"project:service:write": {
			label: "Сервис изменен",
			action: "изменил сервис в",
			description:
				"Сервис был создан, обновлен, запущен, остановлен или перезапущен.",
		},
		"service.down": {
			label: "Приложение остановлено",
			action: "сообщил об остановке приложения",
			description:
				"Контейнер, который должен работать, не запущен (завершился или остановлен OOM).",
		},
		"service.crash_loop": {
			label: "Приложение постоянно падает (CrashLoop)",
			action: "сообщил о постоянных перезапусках приложения",
			description:
				"Контейнер постоянно перезапускается вместо стабильной работы.",
		},
		"service.unhealthy": {
			label: "Приложение не прошло проверку",
			action: "сообщил о непройденной проверке приложения",
			description:
				"Контейнер запущен, но его собственная проверка работоспособности завершилась сбоем.",
		},
		"service.recovered": {
			label: "Приложение восстановилось",
			action: "сообщил о восстановлении приложения",
			description: "Сбой завершился, и контейнер снова работает нормально.",
		},
		"service.exec": {
			label: "Команда в сервисе выполнена",
			action: "выполнил команду в сервисе",
			description: "В контейнере сервиса была выполнена команда.",
		},
		"deployment.succeeded": {
			label: "Деплой завершен",
			action: "задеплоил",
			description: "Новый релиз успешно собран и запущен.",
		},
		"deployment.failed": {
			label: "Ошибка деплоя",
			action: "сбой при деплое",
			description: "Сборка или запуск релиза завершились ошибкой.",
		},
		"deployment.cancelled": {
			label: "Деплой отменен",
			action: "отменил деплой",
			description: "Деплой был остановлен до его завершения.",
		},
		"deployment.no_changes": {
			label: "Нет изменений для деплоя",
			action: "не обнаружил изменений для деплоя",
			description:
				"При повторном деплое все сервисы оказались актуальными, текущий релиз остался активным.",
		},
		"server.added": {
			label: "Сервер добавлен",
			action: "добавил сервер",
			description: "Новый сервер подключен к установке Openship.",
		},
		"server.updated": {
			label: "Сервер изменен",
			action: "изменил сервер",
			description: "Настройки или конфигурация сервера были обновлены.",
		},
		"server.removed": {
			label: "Сервер удален",
			action: "удалил сервер",
			description: "Сервер отключен от установки Openship.",
		},
		"server.removal.rejected": {
			label: "В удалении сервера отказано",
			action: "попытался удалить сервер",
			description:
				"Сервер нельзя удалить, так как на нём всё ещё запущены рабочие нагрузки.",
		},
		"server.unreachable": {
			label: "Сервер недоступен",
			action: "потерял связь с сервером",
			description: "Сервер перестал отвечать на запросы проверки состояния.",
		},
		"server.reachable": {
			label: "Связь с сервером восстановлена",
			action: "восстановил связь с сервером",
			description: "Связь с сервером была успешно восстановлена.",
		},
		"domain.added": {
			label: "Домен добавлен",
			action: "добавил домен",
			description: "Новое доменное имя привязано к проекту.",
		},
		"domain.removed": {
			label: "Домен удален",
			action: "удалил домен",
			description: "Доменное имя удалено из проекта.",
		},
		"domain.verified": {
			label: "Домен проверен",
			action: "проверил домен",
			description: "Записи DNS проверены, домен подтвержден.",
		},
		"domain.verification_failed": {
			label: "Сбой проверки домена",
			action: "не смог проверить домен",
			description:
				"Проверка DNS или выпуск SSL-сертификата завершились ошибкой.",
		},
		"domain.verify_failed": {
			label: "Сбой проверки домена",
			action: "не смог проверить домен",
			description:
				"Проверка DNS или выпуск SSL-сертификата завершились ошибкой.",
		},
		"ssl.renewal_failed": {
			label: "Сбой продления SSL",
			action: "не смог продлить SSL для",
			description: "Автоматическое продление сертификата завершилось ошибкой.",
		},
		"organization.created": {
			label: "Организация создана",
			action: "создал организацию",
			description: "Создана новая организация.",
		},
		"organization.deleted": {
			label: "Организация удалена",
			action: "удалил организацию",
			description: "Организация была удалена.",
		},
		"organization.deletion.blocked": {
			label: "В удалении организации отказано",
			action: "попытался удалить организацию",
			description:
				"Удаление заблокировано, так как в организации ещё остались ресурсы.",
		},
		"member.added": {
			label: "Участник добавлен",
			action: "добавил",
			description: "Новый участник добавлен в организацию.",
		},
		"member.removed": {
			label: "Участник удален",
			action: "удалил",
			description: "Участник исключен из организации.",
		},
		"member.role_changed": {
			label: "Роль изменена",
			action: "изменил роль",
			description: "Роль доступа участника была обновлена.",
		},
		"mcp.authorized": {
			label: "ИИ-ассистент авторизован",
			action: "авторизовал ИИ-клиента",
			description: "Клиент MCP был подключен к организации.",
		},
		"mcp.disconnected": {
			label: "ИИ-ассистент отключен",
			action: "отключил ИИ-клиента",
			description: "Доступ клиента MCP был отозван.",
		},
		"mcp.tool_called": {
			label: "Вызов инструмента ИИ",
			action: "вызвал инструмент через ИИ",
			description: "Инструмент Openship был выполнен клиентом MCP.",
		},
	},
	de: {
		"project.updated": {
			label: "App aktualisiert",
			action: "aktualisierte",
			description:
				"Einstellungen, Dienste, Umgebungsvariablen oder Routing wurden geändert.",
		},
		"project.created": {
			label: "App erstellt",
			action: "erstellte",
			description: "Eine neue App und ihre Konfiguration wurden erstellt.",
		},
		"project.deleted": {
			label: "App gelöscht",
			action: "löschte",
			description: "Die App und ihre Workloads wurden gelöscht.",
		},
		"project.deletion.failed": {
			label: "App-Löschung fehlgeschlagen",
			action: "konnte nicht löschen",
			description:
				"Die Bereinigung wurde nicht abgeschlossen; der App-Eintrag wurde für einen sicheren Wiederholungsversuch beibehalten.",
		},
		"project.deletion.rejected": {
			label: "App-Löschung abgelehnt",
			action: "versuchte zu löschen",
			description:
				"Das Löschen wurde verweigert — andere Ressourcen hängen noch von dieser App ab.",
		},
		"project.build_cache.cleared": {
			label: "Build-Cache geleert",
			action: "leerte den Docker-Build-Cache für",
			description:
				"Ungenutzter Build-Cache wurde vom Docker-Host der App entfernt.",
		},
		"service.down": {
			label: "App ausgefallen",
			action: "meldete Ausfall von",
			description: "Ein Container, der laufen sollte, läuft nicht.",
		},
		"service.crash_loop": {
			label: "App in Crash-Schleife",
			action: "meldete Crash-Schleife für",
			description:
				"Ein Container startet wiederholt neu, anstatt stabil zu laufen.",
		},
		"service.unhealthy": {
			label: "App fehlerhaft",
			action: "meldete Zustandswarnung für",
			description:
				"Ein Container läuft, aber seine eigene Zustandskontrolle schlägt fehl.",
		},
		"service.recovered": {
			label: "App wiederhergestellt",
			action: "meldete Wiederherstellung von",
			description:
				"Ein Ausfall wurde beendet und der Container ist wieder funktionsfähig.",
		},
	},
	es: {
		"project.updated": {
			label: "App actualizada",
			action: "actualizó",
			description:
				"Se cambiaron los ajustes, servicios, variables de entorno o enrutamiento.",
		},
		"project.created": {
			label: "App creada",
			action: "creó",
			description: "Se creó una nueva app y su configuración.",
		},
		"project.deleted": {
			label: "App eliminada",
			action: "eliminó",
			description: "La app y sus cargas de trabajo fueron eliminadas.",
		},
		"project.deletion.failed": {
			label: "Error al eliminar la app",
			action: "no pudo eliminar",
			description:
				"La limpieza no se completó, por lo que el registro de la app se mantuvo para un reintento seguro.",
		},
		"project.deletion.rejected": {
			label: "Eliminación de app rechazada",
			action: "intentó eliminar",
			description:
				"Se rechazó la eliminación: otros recursos aún dependen de esta app.",
		},
		"project.build_cache.cleared": {
			label: "Caché de compilación borrada",
			action: "borró la caché de compilación de Docker para",
			description:
				"Se eliminó la caché de compilación no utilizada del host Docker de la app.",
		},
		"service.down": {
			label: "App caída",
			action: "reportó caída de",
			description: "Un contenedor que debería estar funcionando está detenido.",
		},
		"service.crash_loop": {
			label: "App en bucle de reinicios",
			action: "reportó bucle de reinicios en",
			description:
				"Un contenedor se reinicia constantemente en lugar de permanecer activo.",
		},
		"service.unhealthy": {
			label: "App no saludable",
			action: "reportó estado no saludable en",
			description:
				"Un contenedor se está ejecutando pero su prueba de estado falló.",
		},
		"service.recovered": {
			label: "App recuperada",
			action: "reportó recuperación de",
			description:
				"La interrupción finalizó y el contenedor vuelve a estar en buen estado.",
		},
	},
	fr: {
		"project.updated": {
			label: "Application mise à jour",
			action: "a mis à jour",
			description:
				"Les paramètres, services, variables d'environnement ou le routage ont été modifiés.",
		},
		"project.created": {
			label: "Application créée",
			action: "a créé",
			description:
				"Une nouvelle application et sa configuration ont été créées.",
		},
		"project.deleted": {
			label: "Application supprimée",
			action: "a supprimé",
			description:
				"L'application et ses charges de travail ont été supprimées.",
		},
		"project.deletion.failed": {
			label: "Échec de la suppression de l'application",
			action: "n'a pas pu supprimer",
			description:
				"Le nettoyage ne s'est pas terminé ; l'enregistrement de l'application a été conservé pour une nouvelle tentative sécurisée.",
		},
		"project.deletion.rejected": {
			label: "Suppression de l'application refusée",
			action: "a tenté de supprimer",
			description:
				"La suppression a été refusée — d'autres ressources dépendent encore de cette application.",
		},
		"project.build_cache.cleared": {
			label: "Cache de build vidé",
			action: "a vidé le cache de build Docker pour",
			description:
				"Le cache de build inutilisé a été supprimé de l'hôte Docker de l'application.",
		},
		"service.down": {
			label: "Application arrêtée",
			action: "a signalé l'arrêt de",
			description: "Un conteneur qui devrait tourner est arrêté.",
		},
		"service.crash_loop": {
			label: "Application en boucle de crash",
			action: "a signalé une boucle de crash sur",
			description:
				"Un conteneur redémarre continuellement au lieu de rester actif.",
		},
		"service.unhealthy": {
			label: "Application dégradée",
			action: "a signalé un échec de santé sur",
			description: "Un conteneur tourne mais son bilan de santé a échoué.",
		},
		"service.recovered": {
			label: "Application rétablie",
			action: "a signalé le rétablissement de",
			description:
				"L'incident est terminé et le conteneur fonctionne à nouveau normalement.",
		},
	},
	pt: {
		"project.updated": {
			label: "App atualizada",
			action: "atualizou",
			description:
				"As definições, serviços, variáveis de ambiente ou encaminhamento foram alterados.",
		},
		"project.created": {
			label: "App criada",
			action: "criou",
			description: "Foi criada uma nova app e a respetiva configuração.",
		},
		"project.deleted": {
			label: "App eliminada",
			action: "eliminou",
			description: "A app e as respetivas cargas de trabalho foram eliminadas.",
		},
		"project.deletion.failed": {
			label: "Falha ao eliminar app",
			action: "não conseguiu eliminar",
			description:
				"A limpeza não foi concluída, pelo que o registo da app foi mantido para nova tentativa segura.",
		},
		"project.deletion.rejected": {
			label: "Eliminação da app recusada",
			action: "tentou eliminar",
			description:
				"A eliminação foi recusada — outros recursos ainda dependem desta app.",
		},
		"project.build_cache.cleared": {
			label: "Cache de compilação limpa",
			action: "limpou a cache de compilação Docker de",
			description:
				"A cache de compilação não utilizada foi removida do host Docker da app.",
		},
		"service.down": {
			label: "App em baixo",
			action: "comunicou a paragem de",
			description: "Um contentor que devia estar a correr foi terminado.",
		},
		"service.crash_loop": {
			label: "App em reinícios constantes",
			action: "comunicou reinícios constantes em",
			description:
				"Um contentor reinicia continuamente em vez de permanecer ativo.",
		},
		"service.unhealthy": {
			label: "App não saudável",
			action: "comunicou falha de verificação em",
			description:
				"O contentor está em execução mas a verificação de saúde falhou.",
		},
		"service.recovered": {
			label: "App recuperada",
			action: "comunicou recuperação de",
			description:
				"A interrupção terminou e o contentor voltou a estar operacional.",
		},
	},
	ja: {
		"project.updated": {
			label: "アプリを更新",
			action: "が更新しました",
			description:
				"設定、サービス、環境変数、またはルーティングが変更されました。",
		},
		"project.created": {
			label: "アプリを作成",
			action: "が作成しました",
			description: "新しいアプリとその構成が作成されました。",
		},
		"project.deleted": {
			label: "アプリを削除",
			action: "が削除しました",
			description: "アプリとそのワークロードが削除されました。",
		},
		"project.deletion.failed": {
			label: "アプリ削除の失敗",
			action: "の削除に失敗しました",
			description:
				"クリーンアップが完了しなかったため、安全に再試行できるようアプリの記録が保持されました。",
		},
		"project.deletion.rejected": {
			label: "アプリ削除の拒否",
			action: "を削除しようとしました",
			description:
				"削除が拒否されました — 他のリソースがまだこのアプリに依存しています。",
		},
		"project.build_cache.cleared": {
			label: "ビルドキャッシュをクリア",
			action: "のDockerビルドキャッシュをクリアしました",
			description:
				"未使用のビルドキャッシュがアプリのDockerホストから削除されました。",
		},
		"service.down": {
			label: "アプリが停止",
			action: "の停止を報告しました",
			description: "実行中であるべきコンテナが停止しています。",
		},
		"service.crash_loop": {
			label: "アプリがクラッシュループ中",
			action: "のクラッシュループを報告しました",
			description: "コンテナが安定して動作せず再起動を繰り返しています。",
		},
		"service.unhealthy": {
			label: "アプリのヘルスチェック異常",
			action: "のヘルスチェック失敗を報告しました",
			description: "コンテナは実行中ですが、ヘルスチェックに失敗しています。",
		},
		"service.recovered": {
			label: "アプリが回復",
			action: "の回復を報告しました",
			description: "障害が解消し、コンテナが再び正常に稼働しています。",
		},
	},
	zh: {
		"project.updated": {
			label: "应用已更新",
			action: "更新了",
			description: "设置、服务、环境变量或路由已被更改。",
		},
		"project.created": {
			label: "应用已创建",
			action: "创建了",
			description: "已创建新应用及其配置。",
		},
		"project.deleted": {
			label: "应用已删除",
			action: "删除了",
			description: "应用及其运行负载已被删除。",
		},
		"project.deletion.failed": {
			label: "删除应用失败",
			action: "未能删除",
			description: "清理未完成，已保留应用记录以便安全重试。",
		},
		"project.deletion.rejected": {
			label: "删除应用被拒绝",
			action: "尝试删除",
			description: "删除被拒绝 — 仍有其他资源依赖于此应用。",
		},
		"project.build_cache.cleared": {
			label: "构建缓存已清除",
			action: "清除了 Docker 构建缓存",
			description: "已从应用的 Docker 主机中移除未使用的构建缓存。",
		},
		"service.down": {
			label: "应用已宕机",
			action: "报告应用宕机",
			description: "应当运行的容器已停止运行。",
		},
		"service.crash_loop": {
			label: "应用陷入重启循环",
			action: "报告应用重启循环",
			description: "容器不断重启未能保持稳定运行。",
		},
		"service.unhealthy": {
			label: "应用运行不健康",
			action: "报告健康检查失败",
			description: "容器正在运行，但其健康检查未通过。",
		},
		"service.recovered": {
			label: "应用已恢复",
			action: "报告应用恢复正常",
			description: "故障已解除，容器已恢复正常健康状态。",
		},
	},
	tr: {
		"project.updated": {
			label: "Uygulama güncellendi",
			action: "güncelledi",
			description:
				"Ayarlar, servisler, ortam değişkenleri veya yönlendirme değiştirildi.",
		},
		"project.created": {
			label: "Uygulama oluşturuldu",
			action: "oluşturdu",
			description: "Yeni bir uygulama ve yapılandırması oluşturuldu.",
		},
		"project.deleted": {
			label: "Uygulama silindi",
			action: "sildi",
			description: "Uygulama ve iş yükleri silindi.",
		},
		"project.deletion.failed": {
			label: "Uygulama silme başarısız",
			action: "silinemedi",
			description:
				"Temizleme tamamlanmadı, bu nedenle uygulama kaydı güvenli bir yeniden deneme için korundu.",
		},
		"project.deletion.rejected": {
			label: "Uygulama silme reddedildi",
			action: "silmeye çalıştı",
			description:
				"Silme işlemi reddedildi — bazı kaynaklar hâlâ bu uygulamaya bağlı.",
		},
		"project.build_cache.cleared": {
			label: "Derleme önbelleği temizlendi",
			action: "için Docker derleme önbelleğini temizledi",
			description:
				"Kullanılmayan derleme önbelleği uygulamanın Docker ana makinesinden kaldırıldı.",
		},
		"service.down": {
			label: "Uygulama kapandı",
			action: "çevrimdışı olduğunu bildirdi",
			description: "Çalışması gereken bir kapsayıcı kapandı.",
		},
		"service.crash_loop": {
			label: "Uygulama çökme döngüsünde",
			action: "çökme döngüsünde olduğunu bildirdi",
			description:
				"Bir kapsayıcı ayakta kalmak yerine sürekli yeniden başlıyor.",
		},
		"service.unhealthy": {
			label: "Uygulama sağlıksız",
			action: "sağlık kontrolünün başarısız olduğunu bildirdi",
			description:
				"Kapsayıcı çalışıyor ancak kendi sağlık kontrolü başarısız oluyor.",
		},
		"service.recovered": {
			label: "Uygulama kurtarıldı",
			action: "kurtarıldığını bildirdi",
			description: "Kesinti sona erdi ve kapsayıcı yeniden sağlıklı durumda.",
		},
	},
	ar: {
		"project.updated": {
			label: "تم تحديث التطبيق",
			action: "قام بتحديث",
			description:
				"تم تغيير الإعدادات أو الخدمات أو المتغيرات البيئية أو التوجيه.",
		},
		"project.created": {
			label: "تم إنشاء التطبيق",
			action: "قام بإنشاء",
			description: "تم إنشاء تطبيق جديد وإعداده.",
		},
		"project.deleted": {
			label: "تم حذف التطبيق",
			action: "قام بحذف",
			description: "تم حذف التطبيق وأعباء العمل التابعة له.",
		},
		"project.deletion.failed": {
			label: "فشل حذف التطبيق",
			action: "فشل في حذف",
			description:
				"لم تكتمل عملية التنظيف، لذا تم الاحتفاظ بسجل التطبيق لإعادة المحاولة بأمان.",
		},
		"project.deletion.rejected": {
			label: "تم رفض حذف التطبيق",
			action: "حاول حذف",
			description: "تم رفض الحذف — لا تزال هناك موارد تعتمد على هذا التطبيق.",
		},
		"project.build_cache.cleared": {
			label: "تم مسح ذاكرة التخزين المؤقت للبناء",
			action: "قام بمسح ذاكرة التخزين المؤقت لبناء Docker لـ",
			description:
				"تمت إزالة ذاكرة التخزين المؤقت للبناء غير المستخدمة من مضيف Docker الخاص بالتطبيق.",
		},
		"service.down": {
			label: "توقف التطبيق",
			action: "أبلغ عن توقف",
			description: "توقف الحاوية التي ينبغي أن تعمل بشكل غير متوقع.",
		},
		"service.crash_loop": {
			label: "التطبيق في حلقة تعطل مستمرة",
			action: "أبلغ عن حلقة تعطل لـ",
			description: "تستمر الحاوية في إعادة التشغيل بدلاً من البقاء قيد التشغيل.",
		},
		"service.unhealthy": {
			label: "التطبيق غير سليم",
			action: "أبلغ عن فشل فحص صحة",
			description: "الحاوية تعمل ولكن فحص حالتها يفشل.",
		},
		"service.recovered": {
			label: "تعافى التطبيق",
			action: "أبلغ عن تعافي",
			description: "انتهى الانقطاع وعادت الحاوية للعمل بشكل سليم.",
		},
	},
};

/**
 * Resolves localized action, label and description for an audit event.
 * Priority:
 *   1. Explicit definition in t.settings.audit.events (if passed from settings.json)
 *   2. Comprehensive fallback dictionary in AUDIT_TRANSLATIONS for active locale
 *   3. Default server taxonomy strings (info.action, info.label, info.description)
 */
export function resolveAuditEventCopy(
	eventType: string,
	info: { action: string; label: string; description?: string },
	auditTranslations?: { events?: Record<string, Partial<AuditEventCopy>> },
	locale = "en",
): AuditEventCopy {
	const events = auditTranslations?.events;

	// 1. Try explicit lookup from settings.json
	const explicit =
		events?.[eventType] ||
		events?.[eventType.replaceAll(".", ":")] ||
		events?.[eventType.replaceAll(":", ".")] ||
		events?.[eventType.replace(".", ":")] ||
		events?.[eventType.replace(":", ".")];

	if (explicit && (explicit.action || explicit.label || explicit.description)) {
		return {
			action: explicit.action || info.action,
			label: explicit.label || info.label,
			description: explicit.description || info.description || "",
			actionWithoutResource: explicit.actionWithoutResource,
		};
	}

	// 2. Try AUDIT_TRANSLATIONS for active locale (or short code e.g. "ru-RU" -> "ru")
	const lang = locale.split(/[-_]/)[0]?.toLowerCase() || "en";
	const dict = AUDIT_TRANSLATIONS[lang];
	if (dict) {
		const match =
			dict[eventType] ||
			dict[eventType.replaceAll(".", ":")] ||
			dict[eventType.replaceAll(":", ".")] ||
			dict[eventType.replace(".", ":")] ||
			dict[eventType.replace(":", ".")];

		if (match) {
			return {
				action: match.action || info.action,
				label: match.label || info.label,
				description: match.description || info.description || "",
				actionWithoutResource: match.actionWithoutResource,
			};
		}
	}

	// 3. Fallback to info
	return {
		action: info.action,
		label: info.label,
		description: info.description || "",
	};
}
