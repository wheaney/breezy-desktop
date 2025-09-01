// New implementation using QProcess to call python
#include "xrdriveripc.h"

#include <iostream>
#include <cmath>
#include <QFileInfo>
#include <QProcess>
#include <QProcessEnvironment>
#include <QStandardPaths>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonValue>

XRDriverIPC &XRDriverIPC::instance() {
	static XRDriverIPC inst;
	if (!inst.m_initialized) {
		QString installedFile = QStandardPaths::locate(
			QStandardPaths::GenericDataLocation,
			QStringLiteral("kwin/effects/breezy_desktop/xrdriveripc.py"),
			QStandardPaths::LocateFile);
		if (installedFile.isEmpty()) {
			throw std::runtime_error("Cannot locate kwin/effects/breezy_desktop/xrdriveripc.py");
		}
		inst.m_pythonDir = QFileInfo(installedFile).path();
		inst.m_initialized = true;
	}
	return inst;
}

std::string XRDriverIPC::configHome() const {
	QString configHome = QString::fromUtf8(qgetenv("XDG_CONFIG_HOME"));
	if (configHome.isEmpty()) {
		QString homeDir = QString::fromUtf8(qgetenv("HOME"));
		configHome = homeDir + QStringLiteral("/.config");
	}
	return configHome.toStdString();
}

QByteArray XRDriverIPC::invokePython(const QString &method,
										   const QByteArray &payloadJson,
										   const QString &singleArg) const {
	QProcess proc;
	QProcessEnvironment env = QProcessEnvironment::systemEnvironment();
	env.insert(QStringLiteral("BREEZY_METHOD"), method);
	env.insert(QStringLiteral("BREEZY_CONFIG_HOME"), QString::fromStdString(configHome()));
	if (!singleArg.isEmpty()) env.insert(QStringLiteral("BREEZY_ARG"), singleArg);
	if (!payloadJson.isEmpty()) env.insert(QStringLiteral("BREEZY_PAYLOAD"), QString::fromUtf8(payloadJson));
	proc.setProcessEnvironment(env);
	// Expect xrdriveripc_runner.py to reside in the same directory as xrdriveripc.py (m_pythonDir)
	QString wrapperPath = m_pythonDir + QStringLiteral("/xrdriveripc_runner.py");
	proc.start(QStringLiteral("python3"), QStringList() << wrapperPath);
	if (!proc.waitForStarted(5000)) {
		std::cerr << "Failed to start python process" << std::endl;
		return {};
	}
	proc.closeWriteChannel();
	if (!proc.waitForFinished(15000)) {
		proc.kill();
		std::cerr << "Python process timeout" << std::endl;
		return {};
	}
	if (proc.exitStatus() != QProcess::NormalExit || proc.exitCode() != 0) {
		std::cerr << "Python process failed (" << proc.exitCode() << "):\n"
				  << proc.readAllStandardError().toStdString() << std::endl;
		return {};
	}
	return proc.readAllStandardOutput().trimmed();
}

std::optional<QJsonObject> XRDriverIPC::retrieveConfig() {
	QByteArray out = invokePython(QStringLiteral("retrieve_config"), {}, QStringLiteral("1"));
	if (out.isEmpty()) return std::nullopt;
	QJsonParseError err; auto doc = QJsonDocument::fromJson(out, &err);
	if (err.error != QJsonParseError::NoError || !doc.isObject()) return std::nullopt;
	return doc.object();
}

std::optional<QJsonObject> XRDriverIPC::retrieveDriverState() {
	QByteArray out = invokePython(QStringLiteral("retrieve_driver_state"), {}, {});
	if (out.isEmpty()) return std::nullopt;
	QJsonParseError err; auto doc = QJsonDocument::fromJson(out, &err);
	if (err.error != QJsonParseError::NoError || !doc.isObject()) return std::nullopt;
	return doc.object();
}

bool XRDriverIPC::writeConfig(const QJsonObject &configUpdate) {
	QByteArray payload = QJsonDocument(configUpdate).toJson(QJsonDocument::Compact);
	QByteArray out = invokePython(QStringLiteral("write_config"), payload, {});
	return !out.isEmpty();
}

bool XRDriverIPC::writeControlFlags(const std::map<std::string, bool> &flags) {
	QJsonObject obj; for (const auto &kv : flags) obj.insert(QString::fromStdString(kv.first), kv.second);
	QByteArray payload = QJsonDocument(obj).toJson(QJsonDocument::Compact);
	QByteArray out = invokePython(QStringLiteral("write_control_flags"), payload, {});
	return !out.isEmpty();
}

bool XRDriverIPC::requestToken(const std::string &email) {
	QByteArray out = invokePython(QStringLiteral("request_token"), {}, QString::fromStdString(email));
	if (out.isEmpty()) return false;
	QString result = QString::fromUtf8(out).trimmed().toLower();
    return result == QStringLiteral("true");
}

bool XRDriverIPC::verifyToken(const std::string &token) {
	QByteArray out = invokePython(QStringLiteral("verify_token"), {}, QString::fromStdString(token));
	if (out.isEmpty()) return false;
	QString result = QString::fromUtf8(out).trimmed().toLower();
    return result == QStringLiteral("true");
}
