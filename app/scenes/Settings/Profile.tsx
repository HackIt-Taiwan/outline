import { observer } from "mobx-react";
import { ProfileIcon } from "outline-icons";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Avatar, AvatarSize } from "~/components/Avatar";
import Heading from "~/components/Heading";
import Input from "~/components/Input";
import Scene from "~/components/Scene";
import Text from "~/components/Text";
import env from "~/env";
import useCurrentUser from "~/hooks/useCurrentUser";
import SettingRow from "./components/SettingRow";

const Profile = () => {
  const user = useCurrentUser();
  const { t } = useTranslation();
  const profileManagedNotice = t(
    "Your name and photo are managed by your identity provider."
  );

  return (
    <Scene title={t("Profile")} icon={<ProfileIcon />}>
      <Heading>{t("Profile")}</Heading>
      <Text as="p" type="secondary">
        <Trans>Manage how you appear to other members of the workspace.</Trans>
      </Text>

      <form>
        <SettingRow
          label={t("Photo")}
          name="avatarUrl"
          description={t("This photo is managed by your identity provider.")}
        >
          <Avatar
            model={user}
            size={AvatarSize.Upload}
            alt={t("Profile picture")}
          />
          <Text type="secondary">{profileManagedNotice}</Text>
        </SettingRow>
        <SettingRow
          border={env.EMAIL_ENABLED}
          label={t("Name")}
          name="name"
          description={t(
            "This is managed by your identity provider and cannot be edited here."
          )}
        >
          <Input
            id="name"
            autoComplete="name"
            value={user.name}
            readOnly
            disabled
          />
          <Text type="secondary">{profileManagedNotice}</Text>
        </SettingRow>

        {env.EMAIL_ENABLED && (
          <SettingRow border={false} label={t("Email address")} name="email">
            <Input
              type="email"
              value={user.email}
              readOnly
              disabled
            />
            <Text type="secondary">
              {t("Email is managed by your identity provider.")}
            </Text>
          </SettingRow>
        )}

      </form>
    </Scene>
  );
};

export default observer(Profile);
