export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      artist_follows: {
        Row: {
          artist_id: string;
          created_at: string;
          user_id: string;
        };
        Insert: {
          artist_id: string;
          created_at?: string;
          user_id?: string;
        };
        Update: {
          artist_id?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "artist_follows_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artists";
            referencedColumns: ["id"];
          },
        ];
      };
      artist_members: {
        Row: {
          accepted_at: string | null;
          artist_id: string;
          created_at: string;
          invited_by: string | null;
          role: Database["public"]["Enums"]["artist_member_role"];
          user_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          artist_id: string;
          created_at?: string;
          invited_by?: string | null;
          role?: Database["public"]["Enums"]["artist_member_role"];
          user_id: string;
        };
        Update: {
          accepted_at?: string | null;
          artist_id?: string;
          created_at?: string;
          invited_by?: string | null;
          role?: Database["public"]["Enums"]["artist_member_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "artist_members_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artists";
            referencedColumns: ["id"];
          },
        ];
      };
      artist_verification_requests: {
        Row: {
          artist_id: string;
          created_at: string;
          decision_note: string | null;
          evidence: NonNullable<Json>;
          id: string;
          note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          submitted_by: string | null;
        };
        Insert: {
          artist_id: string;
          created_at?: string;
          decision_note?: string | null;
          evidence?: NonNullable<Json>;
          id?: string;
          note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          submitted_by?: string | null;
        };
        Update: {
          artist_id?: string;
          created_at?: string;
          decision_note?: string | null;
          evidence?: NonNullable<Json>;
          id?: string;
          note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          submitted_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "artist_verification_requests_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artists";
            referencedColumns: ["id"];
          },
        ];
      };
      artists: {
        Row: {
          bio: string | null;
          city: string | null;
          created_at: string;
          created_by: string | null;
          formed_year: number | null;
          id: string;
          image_id: string | null;
          name: string;
          slug: string;
          status: Database["public"]["Enums"]["artist_status"];
          updated_at: string;
          verification_status: Database["public"]["Enums"]["artist_verification"];
          verified_at: string | null;
          voivodeship: Database["public"]["Enums"]["voivodeship"] | null;
        };
        Insert: {
          bio?: string | null;
          city?: string | null;
          created_at?: string;
          created_by?: string | null;
          formed_year?: number | null;
          id?: string;
          image_id?: string | null;
          name: string;
          slug: string;
          status?: Database["public"]["Enums"]["artist_status"];
          updated_at?: string;
          verification_status?: Database["public"]["Enums"]["artist_verification"];
          verified_at?: string | null;
          voivodeship?: Database["public"]["Enums"]["voivodeship"] | null;
        };
        Update: {
          bio?: string | null;
          city?: string | null;
          created_at?: string;
          created_by?: string | null;
          formed_year?: number | null;
          id?: string;
          image_id?: string | null;
          name?: string;
          slug?: string;
          status?: Database["public"]["Enums"]["artist_status"];
          updated_at?: string;
          verification_status?: Database["public"]["Enums"]["artist_verification"];
          verified_at?: string | null;
          voivodeship?: Database["public"]["Enums"]["voivodeship"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "artists_image_id_fkey";
            columns: ["image_id"];
            isOneToOne: false;
            referencedRelation: "images";
            referencedColumns: ["id"];
          },
        ];
      };
      credits: {
        Row: {
          artist_id: string | null;
          created_at: string;
          detail: string | null;
          id: string;
          name: string;
          role: Database["public"]["Enums"]["credit_role"];
          track_id: string;
        };
        Insert: {
          artist_id?: string | null;
          created_at?: string;
          detail?: string | null;
          id?: string;
          name: string;
          role: Database["public"]["Enums"]["credit_role"];
          track_id: string;
        };
        Update: {
          artist_id?: string | null;
          created_at?: string;
          detail?: string | null;
          id?: string;
          name?: string;
          role?: Database["public"]["Enums"]["credit_role"];
          track_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credits_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credits_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
        ];
      };
      entitlements: {
        Row: {
          created_at: string;
          ends_at: string | null;
          granted_by: string | null;
          id: string;
          plan_code: string;
          revoked_at: string | null;
          revoked_by: string | null;
          revoked_reason: string | null;
          source: Database["public"]["Enums"]["entitlement_source"];
          source_ref: string | null;
          starts_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          ends_at?: string | null;
          granted_by?: string | null;
          id?: string;
          plan_code: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          revoked_reason?: string | null;
          source: Database["public"]["Enums"]["entitlement_source"];
          source_ref?: string | null;
          starts_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          ends_at?: string | null;
          granted_by?: string | null;
          id?: string;
          plan_code?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          revoked_reason?: string | null;
          source?: Database["public"]["Enums"]["entitlement_source"];
          source_ref?: string | null;
          starts_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entitlements_plan_code_fkey";
            columns: ["plan_code"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["code"];
          },
        ];
      };
      event_attendance: {
        Row: {
          created_at: string;
          event_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_attendance_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      event_lineup: {
        Row: {
          artist_id: string;
          event_id: string;
          position: number;
        };
        Insert: {
          artist_id: string;
          event_id: string;
          position?: number;
        };
        Update: {
          artist_id?: string;
          event_id?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "event_lineup_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_lineup_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          artist_id: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          ends_at: string | null;
          id: string;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          starts_at: string;
          status: Database["public"]["Enums"]["event_status"];
          ticket_url: string | null;
          title: string;
          venue_id: string;
        };
        Insert: {
          artist_id: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          starts_at: string;
          status?: Database["public"]["Enums"]["event_status"];
          ticket_url?: string | null;
          title: string;
          venue_id: string;
        };
        Update: {
          artist_id?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          starts_at?: string;
          status?: Database["public"]["Enums"]["event_status"];
          ticket_url?: string | null;
          title?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      feature_flags: {
        Row: {
          description: string | null;
          enabled: boolean;
          key: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          description?: string | null;
          enabled?: boolean;
          key: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          description?: string | null;
          enabled?: boolean;
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      genres: {
        Row: {
          id: number;
          name_en: string;
          name_pl: string;
          parent_id: number | null;
          slug: string;
        };
        Insert: {
          id?: never;
          name_en: string;
          name_pl: string;
          parent_id?: number | null;
          slug: string;
        };
        Update: {
          id?: never;
          name_en?: string;
          name_pl?: string;
          parent_id?: number | null;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "genres_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "genres";
            referencedColumns: ["id"];
          },
        ];
      };
      graph_edges: {
        Row: {
          derived_from: NonNullable<Json>;
          dst_id: string;
          dst_type: string;
          refreshed_at: string;
          relation: string;
          src_id: string;
          src_type: string;
          weight: number;
        };
        Insert: {
          derived_from?: NonNullable<Json>;
          dst_id: string;
          dst_type: string;
          refreshed_at?: string;
          relation: string;
          src_id: string;
          src_type: string;
          weight?: number;
        };
        Update: {
          derived_from?: NonNullable<Json>;
          dst_id?: string;
          dst_type?: string;
          refreshed_at?: string;
          relation?: string;
          src_id?: string;
          src_type?: string;
          weight?: number;
        };
        Relationships: [];
      };
      images: {
        Row: {
          artist_id: string | null;
          attempts: number;
          claimed_at: string | null;
          created_at: string;
          dominant_color: string | null;
          height: number | null;
          id: string;
          kind: Database["public"]["Enums"]["image_kind"];
          object_key: string;
          processed_at: string | null;
          rejection_code: string | null;
          release_id: string | null;
          size_bytes: number;
          status: Database["public"]["Enums"]["audio_upload_status"];
          updated_at: string;
          uploaded_at: string | null;
          uploaded_by: string | null;
          variants: NonNullable<Json>;
          width: number | null;
        };
        Insert: {
          artist_id?: string | null;
          attempts?: number;
          claimed_at?: string | null;
          created_at?: string;
          dominant_color?: string | null;
          height?: number | null;
          id?: string;
          kind: Database["public"]["Enums"]["image_kind"];
          object_key: string;
          processed_at?: string | null;
          rejection_code?: string | null;
          release_id?: string | null;
          size_bytes: number;
          status?: Database["public"]["Enums"]["audio_upload_status"];
          updated_at?: string;
          uploaded_at?: string | null;
          uploaded_by?: string | null;
          variants?: NonNullable<Json>;
          width?: number | null;
        };
        Update: {
          artist_id?: string | null;
          attempts?: number;
          claimed_at?: string | null;
          created_at?: string;
          dominant_color?: string | null;
          height?: number | null;
          id?: string;
          kind?: Database["public"]["Enums"]["image_kind"];
          object_key?: string;
          processed_at?: string | null;
          rejection_code?: string | null;
          release_id?: string | null;
          size_bytes?: number;
          status?: Database["public"]["Enums"]["audio_upload_status"];
          updated_at?: string;
          uploaded_at?: string | null;
          uploaded_by?: string | null;
          variants?: NonNullable<Json>;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "images_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "images_release_id_fkey";
            columns: ["release_id"];
            isOneToOne: false;
            referencedRelation: "releases";
            referencedColumns: ["id"];
          },
        ];
      };
      labels: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      listening_events: {
        Row: {
          artist_id: string;
          completed: boolean;
          created_at: string;
          id: string;
          ms_played: number;
          release_id: string;
          soundcheck: boolean;
          started_at: string;
          tier: Database["public"]["Enums"]["quality_tier"] | null;
          track_id: string;
          user_id: string;
        };
        Insert: {
          artist_id: string;
          completed?: boolean;
          created_at?: string;
          id?: string;
          ms_played: number;
          release_id: string;
          soundcheck?: boolean;
          started_at: string;
          tier?: Database["public"]["Enums"]["quality_tier"] | null;
          track_id: string;
          user_id: string;
        };
        Update: {
          artist_id?: string;
          completed?: boolean;
          created_at?: string;
          id?: string;
          ms_played?: number;
          release_id?: string;
          soundcheck?: boolean;
          started_at?: string;
          tier?: Database["public"]["Enums"]["quality_tier"] | null;
          track_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listening_events_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
        ];
      };
      listening_monthly_artist_shares: {
        Row: {
          artist_id: string;
          computed_at: string;
          id: number;
          month: string;
          ms_played: number;
          qualified_plays: number;
          user_id: string | null;
        };
        Insert: {
          artist_id: string;
          computed_at?: string;
          id?: never;
          month: string;
          ms_played: number;
          qualified_plays: number;
          user_id?: string | null;
        };
        Update: {
          artist_id?: string;
          computed_at?: string;
          id?: never;
          month?: string;
          ms_played?: number;
          qualified_plays?: number;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "listening_monthly_artist_shares_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artists";
            referencedColumns: ["id"];
          },
        ];
      };
      moderation_decisions: {
        Row: {
          action: string;
          appeal_decided_at: string | null;
          appeal_decided_by: string | null;
          appeal_note: string | null;
          appeal_status: string;
          appeal_text: string | null;
          appealed_at: string | null;
          artist_id: string | null;
          decided_at: string;
          decided_by: string | null;
          id: string;
          owner_id: string | null;
          previous_state: NonNullable<Json>;
          reason: Database["public"]["Enums"]["report_reason"];
          statement: string;
          subject_id: string;
          subject_type: Database["public"]["Enums"]["report_subject"];
        };
        Insert: {
          action: string;
          appeal_decided_at?: string | null;
          appeal_decided_by?: string | null;
          appeal_note?: string | null;
          appeal_status?: string;
          appeal_text?: string | null;
          appealed_at?: string | null;
          artist_id?: string | null;
          decided_at?: string;
          decided_by?: string | null;
          id?: string;
          owner_id?: string | null;
          previous_state?: NonNullable<Json>;
          reason: Database["public"]["Enums"]["report_reason"];
          statement: string;
          subject_id: string;
          subject_type: Database["public"]["Enums"]["report_subject"];
        };
        Update: {
          action?: string;
          appeal_decided_at?: string | null;
          appeal_decided_by?: string | null;
          appeal_note?: string | null;
          appeal_status?: string;
          appeal_text?: string | null;
          appealed_at?: string | null;
          artist_id?: string | null;
          decided_at?: string;
          decided_by?: string | null;
          id?: string;
          owner_id?: string | null;
          previous_state?: NonNullable<Json>;
          reason?: Database["public"]["Enums"]["report_reason"];
          statement?: string;
          subject_id?: string;
          subject_type?: Database["public"]["Enums"]["report_subject"];
        };
        Relationships: [
          {
            foreignKeyName: "moderation_decisions_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artists";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          code: string;
          features: NonNullable<Json>;
          max_quality_tier: Database["public"]["Enums"]["quality_tier"];
          name: string;
          rank: number;
        };
        Insert: {
          code: string;
          features?: NonNullable<Json>;
          max_quality_tier: Database["public"]["Enums"]["quality_tier"];
          name: string;
          rank: number;
        };
        Update: {
          code?: string;
          features?: NonNullable<Json>;
          max_quality_tier?: Database["public"]["Enums"]["quality_tier"];
          name?: string;
          rank?: number;
        };
        Relationships: [];
      };
      playlist_tracks: {
        Row: {
          added_at: string;
          added_by: string | null;
          id: string;
          playlist_id: string;
          position: number;
          track_id: string;
        };
        Insert: {
          added_at?: string;
          added_by?: string | null;
          id?: string;
          playlist_id: string;
          position: number;
          track_id: string;
        };
        Update: {
          added_at?: string;
          added_by?: string | null;
          id?: string;
          playlist_id?: string;
          position?: number;
          track_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "playlist_tracks_playlist_id_fkey";
            columns: ["playlist_id"];
            isOneToOne: false;
            referencedRelation: "playlists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "playlist_tracks_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
        ];
      };
      playlists: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          kind: string;
          owner_id: string;
          title: string;
          updated_at: string;
          visibility: Database["public"]["Enums"]["playlist_visibility"];
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          kind?: string;
          owner_id?: string;
          title: string;
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["playlist_visibility"];
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          kind?: string;
          owner_id?: string;
          title?: string;
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["playlist_visibility"];
        };
        Relationships: [];
      };
      profile_settings: {
        Row: {
          activity_visibility: Database["public"]["Enums"]["visibility_level"];
          age_confirmed_at: string | null;
          locale: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          activity_visibility?: Database["public"]["Enums"]["visibility_level"];
          age_confirmed_at?: string | null;
          locale?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          activity_visibility?: Database["public"]["Enums"]["visibility_level"];
          age_confirmed_at?: string | null;
          locale?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          bio: string | null;
          created_at: string;
          deleted_at: string | null;
          display_name: string | null;
          handle: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          bio?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name?: string | null;
          handle?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          bio?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name?: string | null;
          handle?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      promo_campaigns: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          description: string | null;
          ends_at: string | null;
          id: string;
          max_redemptions_total: number | null;
          name: string;
          partner: string | null;
          per_user_limit: number;
          redemptions_count: number;
          starts_at: string | null;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          max_redemptions_total?: number | null;
          name: string;
          partner?: string | null;
          per_user_limit?: number;
          redemptions_count?: number;
          starts_at?: string | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          max_redemptions_total?: number | null;
          name?: string;
          partner?: string | null;
          per_user_limit?: number;
          redemptions_count?: number;
          starts_at?: string | null;
        };
        Relationships: [];
      };
      promo_redemptions: {
        Row: {
          campaign_id: string;
          code_id: string;
          entitlement_id: string | null;
          id: string;
          redeemed_at: string;
          status: string;
          user_id: string;
        };
        Insert: {
          campaign_id: string;
          code_id: string;
          entitlement_id?: string | null;
          id?: string;
          redeemed_at?: string;
          status?: string;
          user_id: string;
        };
        Update: {
          campaign_id?: string;
          code_id?: string;
          entitlement_id?: string | null;
          id?: string;
          redeemed_at?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "promo_campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promo_redemptions_entitlement_id_fkey";
            columns: ["entitlement_id"];
            isOneToOne: false;
            referencedRelation: "entitlements";
            referencedColumns: ["id"];
          },
        ];
      };
      release_artists: {
        Row: {
          artist_id: string;
          position: number;
          release_id: string;
          role: Database["public"]["Enums"]["release_artist_role"];
        };
        Insert: {
          artist_id: string;
          position?: number;
          release_id: string;
          role?: Database["public"]["Enums"]["release_artist_role"];
        };
        Update: {
          artist_id?: string;
          position?: number;
          release_id?: string;
          role?: Database["public"]["Enums"]["release_artist_role"];
        };
        Relationships: [
          {
            foreignKeyName: "release_artists_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "release_artists_release_id_fkey";
            columns: ["release_id"];
            isOneToOne: false;
            referencedRelation: "releases";
            referencedColumns: ["id"];
          },
        ];
      };
      release_genres: {
        Row: {
          genre_id: number;
          release_id: string;
        };
        Insert: {
          genre_id: number;
          release_id: string;
        };
        Update: {
          genre_id?: number;
          release_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "release_genres_genre_id_fkey";
            columns: ["genre_id"];
            isOneToOne: false;
            referencedRelation: "genres";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "release_genres_release_id_fkey";
            columns: ["release_id"];
            isOneToOne: false;
            referencedRelation: "releases";
            referencedColumns: ["id"];
          },
        ];
      };
      release_likes: {
        Row: {
          created_at: string;
          release_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          release_id: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          release_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "release_likes_release_id_fkey";
            columns: ["release_id"];
            isOneToOne: false;
            referencedRelation: "releases";
            referencedColumns: ["id"];
          },
        ];
      };
      release_review_events: {
        Row: {
          created_at: string;
          id: number;
          kind: Database["public"]["Enums"]["release_review_kind"];
          note: string | null;
          release_id: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          kind: Database["public"]["Enums"]["release_review_kind"];
          note?: string | null;
          release_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          kind?: Database["public"]["Enums"]["release_review_kind"];
          note?: string | null;
          release_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "release_review_events_release_id_fkey";
            columns: ["release_id"];
            isOneToOne: false;
            referencedRelation: "releases";
            referencedColumns: ["id"];
          },
        ];
      };
      releases: {
        Row: {
          ai_content: Database["public"]["Enums"]["ai_content"];
          artist_id: string;
          artwork_image_id: string | null;
          c_line: string | null;
          created_at: string;
          created_by: string | null;
          explicit: boolean;
          id: string;
          label_id: string | null;
          p_line: string | null;
          publish_at: string | null;
          release_date: string | null;
          review_note: string | null;
          reviewed_at: string | null;
          slug: string;
          status: Database["public"]["Enums"]["release_status"];
          submitted_at: string | null;
          territories: string[];
          title: string;
          type: Database["public"]["Enums"]["release_type"];
          upc: string | null;
          updated_at: string;
        };
        Insert: {
          ai_content?: Database["public"]["Enums"]["ai_content"];
          artist_id: string;
          artwork_image_id?: string | null;
          c_line?: string | null;
          created_at?: string;
          created_by?: string | null;
          explicit?: boolean;
          id?: string;
          label_id?: string | null;
          p_line?: string | null;
          publish_at?: string | null;
          release_date?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          slug: string;
          status?: Database["public"]["Enums"]["release_status"];
          submitted_at?: string | null;
          territories?: string[];
          title: string;
          type: Database["public"]["Enums"]["release_type"];
          upc?: string | null;
          updated_at?: string;
        };
        Update: {
          ai_content?: Database["public"]["Enums"]["ai_content"];
          artist_id?: string;
          artwork_image_id?: string | null;
          c_line?: string | null;
          created_at?: string;
          created_by?: string | null;
          explicit?: boolean;
          id?: string;
          label_id?: string | null;
          p_line?: string | null;
          publish_at?: string | null;
          release_date?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          slug?: string;
          status?: Database["public"]["Enums"]["release_status"];
          submitted_at?: string | null;
          territories?: string[];
          title?: string;
          type?: Database["public"]["Enums"]["release_type"];
          upc?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "releases_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "releases_artwork_image_id_fkey";
            columns: ["artwork_image_id"];
            isOneToOne: false;
            referencedRelation: "images";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "releases_label_id_fkey";
            columns: ["label_id"];
            isOneToOne: false;
            referencedRelation: "labels";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          claimant_email: string | null;
          claimant_name: string | null;
          created_at: string;
          decision_id: string | null;
          details: string;
          good_faith: boolean;
          id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reporter_id: string | null;
          status: string;
          subject_id: string;
          subject_type: Database["public"]["Enums"]["report_subject"];
        };
        Insert: {
          claimant_email?: string | null;
          claimant_name?: string | null;
          created_at?: string;
          decision_id?: string | null;
          details: string;
          good_faith?: boolean;
          id?: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reporter_id?: string | null;
          status?: string;
          subject_id: string;
          subject_type: Database["public"]["Enums"]["report_subject"];
        };
        Update: {
          claimant_email?: string | null;
          claimant_name?: string | null;
          created_at?: string;
          decision_id?: string | null;
          details?: string;
          good_faith?: boolean;
          id?: string;
          reason?: Database["public"]["Enums"]["report_reason"];
          reporter_id?: string | null;
          status?: string;
          subject_id?: string;
          subject_type?: Database["public"]["Enums"]["report_subject"];
        };
        Relationships: [
          {
            foreignKeyName: "reports_decision_fkey";
            columns: ["decision_id"];
            isOneToOne: false;
            referencedRelation: "moderation_decisions";
            referencedColumns: ["id"];
          },
        ];
      };
      rights_declarations: {
        Row: {
          ai_content: Database["public"]["Enums"]["ai_content"];
          cmo_memberships: string[];
          controls_composition: boolean;
          declared_at: string;
          declared_by: string | null;
          id: string;
          owns_master: boolean;
          release_id: string;
          samples: string;
          samples_description: string | null;
          terms_version: string;
          territories: string[];
        };
        Insert: {
          ai_content: Database["public"]["Enums"]["ai_content"];
          cmo_memberships?: string[];
          controls_composition: boolean;
          declared_at?: string;
          declared_by?: string | null;
          id?: string;
          owns_master: boolean;
          release_id: string;
          samples: string;
          samples_description?: string | null;
          terms_version: string;
          territories: string[];
        };
        Update: {
          ai_content?: Database["public"]["Enums"]["ai_content"];
          cmo_memberships?: string[];
          controls_composition?: boolean;
          declared_at?: string;
          declared_by?: string | null;
          id?: string;
          owns_master?: boolean;
          release_id?: string;
          samples?: string;
          samples_description?: string | null;
          terms_version?: string;
          territories?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "rights_declarations_release_id_fkey";
            columns: ["release_id"];
            isOneToOne: false;
            referencedRelation: "releases";
            referencedColumns: ["id"];
          },
        ];
      };
      track_artists: {
        Row: {
          artist_id: string;
          role: Database["public"]["Enums"]["track_artist_role"];
          track_id: string;
        };
        Insert: {
          artist_id: string;
          role?: Database["public"]["Enums"]["track_artist_role"];
          track_id: string;
        };
        Update: {
          artist_id?: string;
          role?: Database["public"]["Enums"]["track_artist_role"];
          track_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "track_artists_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "track_artists_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
        ];
      };
      track_audio_uploads: {
        Row: {
          attempts: number;
          claimed_at: string | null;
          created_at: string;
          duration_ms: number | null;
          file_name: string;
          id: string;
          integrated_lufs: number | null;
          object_key: string;
          processed_at: string | null;
          rejection_code: string | null;
          rejection_message: string | null;
          report: Json | null;
          size_bytes: number;
          status: Database["public"]["Enums"]["audio_upload_status"];
          track_id: string;
          true_peak_dbtp: number | null;
          updated_at: string;
          uploaded_at: string | null;
          uploaded_by: string | null;
        };
        Insert: {
          attempts?: number;
          claimed_at?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          file_name: string;
          id?: string;
          integrated_lufs?: number | null;
          object_key: string;
          processed_at?: string | null;
          rejection_code?: string | null;
          rejection_message?: string | null;
          report?: Json | null;
          size_bytes: number;
          status?: Database["public"]["Enums"]["audio_upload_status"];
          track_id: string;
          true_peak_dbtp?: number | null;
          updated_at?: string;
          uploaded_at?: string | null;
          uploaded_by?: string | null;
        };
        Update: {
          attempts?: number;
          claimed_at?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          file_name?: string;
          id?: string;
          integrated_lufs?: number | null;
          object_key?: string;
          processed_at?: string | null;
          rejection_code?: string | null;
          rejection_message?: string | null;
          report?: Json | null;
          size_bytes?: number;
          status?: Database["public"]["Enums"]["audio_upload_status"];
          track_id?: string;
          true_peak_dbtp?: number | null;
          updated_at?: string;
          uploaded_at?: string | null;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "track_audio_uploads_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
        ];
      };
      track_audio_variants: {
        Row: {
          bit_depth: number | null;
          bitrate_kbps: number;
          bytes: number;
          codec: string;
          container: string;
          encoder_delay_samples: number;
          nominal_kbps: number | null;
          object_key: string;
          padding_samples: number;
          sample_rate: number;
          samples: number;
          sha256: string;
          tier: Database["public"]["Enums"]["quality_tier"];
          upload_id: string;
        };
        Insert: {
          bit_depth?: number | null;
          bitrate_kbps: number;
          bytes: number;
          codec: string;
          container: string;
          encoder_delay_samples?: number;
          nominal_kbps?: number | null;
          object_key: string;
          padding_samples?: number;
          sample_rate: number;
          samples: number;
          sha256: string;
          tier: Database["public"]["Enums"]["quality_tier"];
          upload_id: string;
        };
        Update: {
          bit_depth?: number | null;
          bitrate_kbps?: number;
          bytes?: number;
          codec?: string;
          container?: string;
          encoder_delay_samples?: number;
          nominal_kbps?: number | null;
          object_key?: string;
          padding_samples?: number;
          sample_rate?: number;
          samples?: number;
          sha256?: string;
          tier?: Database["public"]["Enums"]["quality_tier"];
          upload_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "track_audio_variants_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "track_audio_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      track_likes: {
        Row: {
          created_at: string;
          track_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          track_id: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          track_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "track_likes_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
        ];
      };
      tracks: {
        Row: {
          ai_content: Database["public"]["Enums"]["ai_content"];
          created_at: string;
          disc_number: number;
          duration_ms: number | null;
          explicit: boolean;
          id: string;
          isrc: string | null;
          release_id: string;
          segue_into_next: boolean;
          soundcheck_duration_ms: number | null;
          soundcheck_start_ms: number | null;
          title: string;
          track_number: number;
          updated_at: string;
        };
        Insert: {
          ai_content?: Database["public"]["Enums"]["ai_content"];
          created_at?: string;
          disc_number?: number;
          duration_ms?: number | null;
          explicit?: boolean;
          id?: string;
          isrc?: string | null;
          release_id: string;
          segue_into_next?: boolean;
          soundcheck_duration_ms?: number | null;
          soundcheck_start_ms?: number | null;
          title: string;
          track_number: number;
          updated_at?: string;
        };
        Update: {
          ai_content?: Database["public"]["Enums"]["ai_content"];
          created_at?: string;
          disc_number?: number;
          duration_ms?: number | null;
          explicit?: boolean;
          id?: string;
          isrc?: string | null;
          release_id?: string;
          segue_into_next?: boolean;
          soundcheck_duration_ms?: number | null;
          soundcheck_start_ms?: number | null;
          title?: string;
          track_number?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tracks_release_id_fkey";
            columns: ["release_id"];
            isOneToOne: false;
            referencedRelation: "releases";
            referencedColumns: ["id"];
          },
        ];
      };
      user_blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
        };
        Insert: {
          blocked_id: string;
          blocker_id?: string;
          created_at?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey";
            columns: ["blocked_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey";
            columns: ["blocker_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_follows: {
        Row: {
          created_at: string;
          followee_id: string;
          follower_id: string;
        };
        Insert: {
          created_at?: string;
          followee_id: string;
          follower_id?: string;
        };
        Update: {
          created_at?: string;
          followee_id?: string;
          follower_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_follows_followee_id_fkey";
            columns: ["followee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          granted_by: string | null;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          granted_by?: string | null;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          granted_by?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      venues: {
        Row: {
          address: string | null;
          city: string;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          slug: string;
          verified: boolean;
          voivodeship: Database["public"]["Enums"]["voivodeship"];
          website: string | null;
        };
        Insert: {
          address?: string | null;
          city: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          slug: string;
          verified?: boolean;
          voivodeship: Database["public"]["Enums"]["voivodeship"];
          website?: string | null;
        };
        Update: {
          address?: string | null;
          city?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          slug?: string;
          verified?: boolean;
          voivodeship?: Database["public"]["Enums"]["voivodeship"];
          website?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      abandon_audio_upload: { Args: { reason?: string; upload: string }; Returns: undefined };
      abandon_image_upload: { Args: { image: string }; Returns: undefined };
      accept_artist_membership: { Args: { artist: string }; Returns: undefined };
      access_invite_is_valid: { Args: { code: string }; Returns: boolean };
      add_playlist_track: { Args: { playlist: string; track: string }; Returns: string };
      add_track: { Args: { release: string; title: string }; Returns: string };
      admin_audit_log: {
        Args: { action_prefix?: string; max_results?: number };
        Returns: {
          action: string;
          actor_handle: string;
          actor_kind: string;
          after: Json;
          before: Json;
          created_at: string;
          id: number;
          subject_id: string;
          subject_type: string;
        }[];
      };
      admin_create_promo_campaign: {
        Args: {
          description?: string;
          ends_at?: string;
          max_redemptions_total?: number;
          name: string;
          partner?: string;
          per_user_limit?: number;
          starts_at?: string;
        };
        Returns: string;
      };
      admin_create_shared_promo_code: {
        Args: {
          benefit_type: Database["public"]["Enums"]["promo_benefit"];
          benefit_value: number;
          campaign: string;
          code: string;
          expires_at?: string;
          max_uses: number;
          new_accounts_days?: number;
        };
        Returns: string;
      };
      admin_find_user: { Args: { handle: string }; Returns: string };
      admin_generate_promo_codes: {
        Args: {
          benefit_type: Database["public"]["Enums"]["promo_benefit"];
          benefit_value: number;
          campaign: string;
          expires_at?: string;
          how_many: number;
          new_accounts_days?: number;
        };
        Returns: string[];
      };
      admin_grant_entitlement: {
        Args: { days: number; note: string; plan: string; target_user: string };
        Returns: string;
      };
      admin_grant_role: {
        Args: { role: Database["public"]["Enums"]["app_role"]; target_user: string };
        Returns: undefined;
      };
      admin_list_feature_flags: {
        Args: Record<PropertyKey, never>;
        Returns: {
          description: string;
          enabled: boolean;
          key: string;
          updated_at: string;
        }[];
      };
      admin_list_promo_codes: {
        Args: { campaign: string; hint?: string };
        Returns: {
          active: boolean;
          benefit_type: Database["public"]["Enums"]["promo_benefit"];
          benefit_value: number;
          code_hint: string;
          created_at: string;
          eligibility: Json;
          expires_at: string;
          id: string;
          max_uses: number;
          shared: boolean;
          starts_at: string;
          uses_count: number;
        }[];
      };
      admin_list_promo_redemptions: {
        Args: { campaign: string };
        Returns: {
          code_hint: string;
          display_name: string;
          ends_at: string;
          entitlement_id: string;
          handle: string;
          id: string;
          redeemed_at: string;
          revoked_at: string;
          status: string;
          user_id: string;
        }[];
      };
      admin_list_staff: {
        Args: Record<PropertyKey, never>;
        Returns: {
          display_name: string;
          granted_at: string;
          handle: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        }[];
      };
      admin_listening_shares: {
        Args: { month: string };
        Returns: {
          artist_id: string;
          artist_name: string;
          artist_slug: string;
          hours: number;
          listeners: number;
          qualified_plays: number;
        }[];
      };
      admin_playback_summary: {
        Args: { days?: number };
        Returns: {
          errors: number;
          first_audio_p50_ms: number;
          first_audio_p90_ms: number;
          starts: number;
          tier: Database["public"]["Enums"]["quality_tier"];
          top_error: string;
        }[];
      };
      admin_revoke_entitlement: {
        Args: { entitlement: string; reason: string };
        Returns: undefined;
      };
      admin_revoke_promo_redemption: {
        Args: { reason: string; redemption: string };
        Returns: undefined;
      };
      admin_revoke_role: {
        Args: { role: Database["public"]["Enums"]["app_role"]; target_user: string };
        Returns: undefined;
      };
      admin_set_feature_flag: { Args: { enabled: boolean; flag: string }; Returns: undefined };
      admin_set_promo_campaign_active: {
        Args: { active: boolean; campaign: string };
        Returns: undefined;
      };
      admin_set_promo_code_active: { Args: { active: boolean; code: string }; Returns: undefined };
      appeal_moderation_decision: {
        Args: { appeal: string; decision: string };
        Returns: undefined;
      };
      artist_copyright_strikes: { Args: { artist: string }; Returns: number };
      artist_follower_count: { Args: { artist: string }; Returns: number };
      artist_monthly_listening: {
        Args: { artist: string };
        Returns: {
          listeners: number;
          month: string;
          qualified_plays: number;
        }[];
      };
      begin_audio_upload: {
        Args: { file_name: string; size_bytes: number; track: string };
        Returns: {
          attempts: number;
          claimed_at: string | null;
          created_at: string;
          duration_ms: number | null;
          file_name: string;
          id: string;
          integrated_lufs: number | null;
          object_key: string;
          processed_at: string | null;
          rejection_code: string | null;
          rejection_message: string | null;
          report: Json | null;
          size_bytes: number;
          status: Database["public"]["Enums"]["audio_upload_status"];
          track_id: string;
          true_peak_dbtp: number | null;
          updated_at: string;
          uploaded_at: string | null;
          uploaded_by: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "track_audio_uploads";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      begin_image_upload: {
        Args: {
          extension: string;
          kind: Database["public"]["Enums"]["image_kind"];
          owner: string;
          size_bytes: number;
        };
        Returns: {
          artist_id: string | null;
          attempts: number;
          claimed_at: string | null;
          created_at: string;
          dominant_color: string | null;
          height: number | null;
          id: string;
          kind: Database["public"]["Enums"]["image_kind"];
          object_key: string;
          processed_at: string | null;
          rejection_code: string | null;
          release_id: string | null;
          size_bytes: number;
          status: Database["public"]["Enums"]["audio_upload_status"];
          updated_at: string;
          uploaded_at: string | null;
          uploaded_by: string | null;
          variants: NonNullable<Json>;
          width: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "images";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      can_edit_release: { Args: { release: string }; Returns: boolean };
      can_view_audio_upload: { Args: { upload: string }; Returns: boolean };
      can_view_event: { Args: { event: string }; Returns: boolean };
      can_view_image: { Args: { image: string }; Returns: boolean };
      can_view_playlist: { Args: { playlist: string }; Returns: boolean };
      can_view_release: { Args: { release: string }; Returns: boolean };
      cancel_event: { Args: { event: string }; Returns: undefined };
      claim_audio_upload: {
        Args: Record<PropertyKey, never>;
        Returns: {
          attempts: number;
          id: string;
          object_key: string;
          track_id: string;
        }[];
      };
      claim_image_upload: {
        Args: Record<PropertyKey, never>;
        Returns: {
          attempts: number;
          id: string;
          kind: Database["public"]["Enums"]["image_kind"];
          object_key: string;
        }[];
      };
      complete_audio_upload: {
        Args: { upload: string };
        Returns: {
          attempts: number;
          claimed_at: string | null;
          created_at: string;
          duration_ms: number | null;
          file_name: string;
          id: string;
          integrated_lufs: number | null;
          object_key: string;
          processed_at: string | null;
          rejection_code: string | null;
          rejection_message: string | null;
          report: Json | null;
          size_bytes: number;
          status: Database["public"]["Enums"]["audio_upload_status"];
          track_id: string;
          true_peak_dbtp: number | null;
          updated_at: string;
          uploaded_at: string | null;
          uploaded_by: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "track_audio_uploads";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      complete_image_upload: {
        Args: { image: string };
        Returns: {
          artist_id: string | null;
          attempts: number;
          claimed_at: string | null;
          created_at: string;
          dominant_color: string | null;
          height: number | null;
          id: string;
          kind: Database["public"]["Enums"]["image_kind"];
          object_key: string;
          processed_at: string | null;
          rejection_code: string | null;
          release_id: string | null;
          size_bytes: number;
          status: Database["public"]["Enums"]["audio_upload_status"];
          updated_at: string;
          uploaded_at: string | null;
          uploaded_by: string | null;
          variants: NonNullable<Json>;
          width: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "images";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_access_invites: {
        Args: { codes: string[]; expires_at?: string; label?: string; max_uses?: number };
        Returns: number;
      };
      create_artist: { Args: { name: string; slug: string }; Returns: string };
      create_event: {
        Args: {
          artist: string;
          description?: string;
          ends_at?: string;
          lineup?: string[];
          starts_at: string;
          ticket_url?: string;
          title: string;
          venue: string;
        };
        Returns: string;
      };
      decide_appeal: {
        Args: { decision: string; note: string; outcome: string };
        Returns: undefined;
      };
      delete_my_account: { Args: { confirm_email: string }; Returns: undefined };
      delete_track: { Args: { track: string }; Returns: undefined };
      discover_artists: {
        Args: { max_results?: number; region?: Database["public"]["Enums"]["voivodeship"] };
        Returns: {
          artist_id: string;
          artist_slug: string;
          city: string;
          first_release_at: string;
          image_id: string;
          name: string;
          release_count: number;
          verification_status: Database["public"]["Enums"]["artist_verification"];
          voivodeship: Database["public"]["Enums"]["voivodeship"];
        }[];
      };
      discover_releases: {
        Args: { max_results?: number; region?: Database["public"]["Enums"]["voivodeship"] };
        Returns: {
          artist_name: string;
          artist_slug: string;
          artwork_image_id: string;
          city: string;
          is_debut: boolean;
          publish_at: string;
          release_id: string;
          release_slug: string;
          release_type: Database["public"]["Enums"]["release_type"];
          title: string;
          voivodeship: Database["public"]["Enums"]["voivodeship"];
        }[];
      };
      enforce_mfa: { Args: Record<PropertyKey, never>; Returns: undefined };
      fail_audio_upload: {
        Args: { upload: string };
        Returns: Database["public"]["Enums"]["audio_upload_status"];
      };
      fail_image_upload: {
        Args: { image: string };
        Returns: Database["public"]["Enums"]["audio_upload_status"];
      };
      find_or_create_venue: {
        Args: {
          address?: string;
          city: string;
          name: string;
          voivodeship: Database["public"]["Enums"]["voivodeship"];
          website?: string;
        };
        Returns: string;
      };
      finish_audio_upload: {
        Args: { report: Json; upload: string; variants?: Json };
        Returns: Database["public"]["Enums"]["audio_upload_status"];
      };
      finish_image_upload: {
        Args: { image: string; result: Json };
        Returns: Database["public"]["Enums"]["audio_upload_status"];
      };
      has_app_role: {
        Args: { required: Database["public"]["Enums"]["app_role"] };
        Returns: boolean;
      };
      invite_artist_member: {
        Args: {
          artist: string;
          handle: string;
          role: Database["public"]["Enums"]["artist_member_role"];
        };
        Returns: undefined;
      };
      is_artist_member: {
        Args: { artist: string; roles?: Database["public"]["Enums"]["artist_member_role"][] };
        Returns: boolean;
      };
      is_feature_enabled: { Args: { flag: string }; Returns: boolean };
      is_reserved_handle: { Args: { candidate: string }; Returns: boolean };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      mark_attended: { Args: { event: string }; Returns: undefined };
      moderate_report: {
        Args: { action: string; report: string; statement: string };
        Returns: string;
      };
      move_playlist_track: { Args: { item: string; to_index: number }; Returns: undefined };
      move_track: { Args: { direction: number; track: string }; Returns: undefined };
      my_blocked_users: {
        Args: Record<PropertyKey, never>;
        Returns: {
          blocked_at: string;
          display_name: string;
          handle: string;
          id: string;
        }[];
      };
      my_deletion_blockers: {
        Args: Record<PropertyKey, never>;
        Returns: {
          artist_id: string;
          name: string;
          slug: string;
        }[];
      };
      my_plan: {
        Args: Record<PropertyKey, never>;
        Returns: {
          ends_at: string;
          max_quality_tier: Database["public"]["Enums"]["quality_tier"];
          plan_code: string;
          plan_name: string;
          source: Database["public"]["Enums"]["entitlement_source"];
          source_ref: string;
        }[];
      };
      my_recent_tracks: {
        Args: { max_results?: number };
        Returns: {
          last_played_at: string;
          plays: number;
          track_id: string;
        }[];
      };
      profile_attended_events: {
        Args: { profile: string };
        Returns: {
          event_id: string;
          marked_at: string;
          starts_at: string;
          title: string;
          venue_city: string;
          venue_name: string;
        }[];
      };
      profile_playlists: {
        Args: { profile: string };
        Returns: {
          id: string;
          title: string;
          track_count: number;
          updated_at: string;
        }[];
      };
      profile_relationship: {
        Args: { profile: string };
        Returns: {
          activity_visible: boolean;
          followers: number;
          following: number;
          i_blocked: boolean;
          i_follow: boolean;
        }[];
      };
      record_listen: {
        Args: {
          completed?: boolean;
          ms_played: number;
          soundcheck?: boolean;
          started_at: string;
          tier?: Database["public"]["Enums"]["quality_tier"];
          track: string;
        };
        Returns: undefined;
      };
      redeem_promo_code: { Args: { code: string }; Returns: Json };
      related_artists: {
        Args: { artist: string; max_results?: number };
        Returns: {
          artist_id: string;
          city: string;
          evidence: Json;
          image_id: string;
          name: string;
          relation: string;
          score: number;
          slug: string;
          voivodeship: Database["public"]["Enums"]["voivodeship"];
        }[];
      };
      release_is_public: { Args: { release: string }; Returns: boolean };
      release_playback: {
        Args: { release: string };
        Returns: {
          source: Json;
          track_id: string;
          upload_id: string;
          variants: Json;
        }[];
      };
      release_readiness: { Args: { release: string }; Returns: Json };
      release_soundchecks: {
        Args: { releases: string[] };
        Returns: {
          duration_ms: number;
          release_id: string;
          start_ms: number;
          title: string;
          track_id: string;
        }[];
      };
      remove_artist_member: { Args: { artist: string; member: string }; Returns: undefined };
      report_playback: {
        Args: {
          browser?: string;
          error_code?: string;
          first_audio_ms?: number;
          outcome: string;
          strategy?: string;
          tier?: Database["public"]["Enums"]["quality_tier"];
        };
        Returns: undefined;
      };
      request_artist_verification: {
        Args: { artist: string; evidence: Json; note?: string };
        Returns: string;
      };
      require_staff: {
        Args: { required: Database["public"]["Enums"]["app_role"] };
        Returns: undefined;
      };
      review_artist_verification: {
        Args: { decision: string; note?: string; request: string };
        Returns: undefined;
      };
      review_event: {
        Args: { decision: string; event: string; note?: string };
        Returns: undefined;
      };
      review_release: {
        Args: { decision: string; note?: string; release: string };
        Returns: Database["public"]["Enums"]["release_status"];
      };
      search_catalog: {
        Args: { max_results?: number; query: string };
        Returns: {
          artist_name: string;
          artist_slug: string;
          id: string;
          image_id: string;
          kind: string;
          release_id: string;
          release_slug: string;
          release_title: string;
          release_type: Database["public"]["Enums"]["release_type"];
          score: number;
          title: string;
        }[];
      };
      search_normalize: { Args: { value: string }; Returns: string };
      set_release_genres: { Args: { genre_ids: number[]; release: string }; Returns: undefined };
      submit_release: { Args: { release: string }; Returns: undefined };
      submit_report: {
        Args: {
          claimant_email?: string;
          claimant_name?: string;
          details: string;
          good_faith?: boolean;
          reason: Database["public"]["Enums"]["report_reason"];
          subject_id: string;
          subject_type: Database["public"]["Enums"]["report_subject"];
        };
        Returns: string;
      };
      system_create_promo_codes: {
        Args: {
          benefit_type: Database["public"]["Enums"]["promo_benefit"];
          benefit_value: number;
          campaign_name: string;
          eligibility?: Json;
          expires_at?: string;
          how_many?: number;
          max_uses?: number;
          shared_code?: string;
        };
        Returns: string[];
      };
      system_grant_entitlement: {
        Args: {
          days: number;
          note: string;
          plan: string;
          source: Database["public"]["Enums"]["entitlement_source"];
          target_email: string;
        };
        Returns: string;
      };
      system_grant_role: {
        Args: { role: Database["public"]["Enums"]["app_role"]; target_email: string };
        Returns: string;
      };
      upcoming_events: {
        Args: { max_results?: number; region?: Database["public"]["Enums"]["voivodeship"] };
        Returns: {
          city: string;
          event_id: string;
          lineup: Json;
          starts_at: string;
          status: Database["public"]["Enums"]["event_status"];
          ticket_url: string;
          title: string;
          venue_name: string;
          venue_slug: string;
          voivodeship: Database["public"]["Enums"]["voivodeship"];
        }[];
      };
      withdraw_release_submission: { Args: { release: string }; Returns: undefined };
    };
    Enums: {
      ai_content: "human" | "ai_assisted" | "ai_generated" | "unknown";
      app_role: "moderator" | "admin";
      artist_member_role: "owner" | "manager" | "member";
      artist_status: "active" | "suspended";
      artist_verification: "unverified" | "pending" | "verified" | "rejected";
      audio_upload_status:
        "pending" | "uploaded" | "processing" | "accepted" | "rejected" | "failed";
      credit_role:
        | "producer"
        | "songwriter"
        | "composer"
        | "lyricist"
        | "performer"
        | "mixing_engineer"
        | "mastering_engineer"
        | "other";
      entitlement_source: "promo" | "beta" | "admin" | "referral" | "subscription";
      event_status: "pending" | "published" | "rejected" | "cancelled";
      image_kind: "release_artwork" | "artist_image";
      playlist_visibility: "public" | "unlisted" | "private";
      promo_benefit:
        | "premium_days"
        | "premium_months"
        | "premium_lifetime"
        | "feature_access"
        | "percent_discount"
        | "fixed_discount";
      quality_tier: "data_saver" | "high" | "lossless" | "hires";
      release_artist_role: "primary" | "featured";
      release_review_kind: "submitted" | "withdrawn" | "approved" | "returned";
      release_status:
        "draft" | "processing" | "in_review" | "approved" | "published" | "rejected" | "taken_down";
      release_type: "single" | "ep" | "album" | "compilation" | "live";
      report_reason: "copyright" | "illegal" | "hate" | "impersonation" | "spam" | "other";
      report_subject: "artist" | "release" | "playlist" | "event" | "venue" | "profile";
      track_artist_role: "main" | "featured" | "remixer";
      visibility_level: "public" | "followers" | "private";
      voivodeship:
        | "dolnoslaskie"
        | "kujawsko_pomorskie"
        | "lubelskie"
        | "lubuskie"
        | "lodzkie"
        | "malopolskie"
        | "mazowieckie"
        | "opolskie"
        | "podkarpackie"
        | "podlaskie"
        | "pomorskie"
        | "slaskie"
        | "swietokrzyskie"
        | "warminsko_mazurskie"
        | "wielkopolskie"
        | "zachodniopomorskie";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      ai_content: ["human", "ai_assisted", "ai_generated", "unknown"],
      app_role: ["moderator", "admin"],
      artist_member_role: ["owner", "manager", "member"],
      artist_status: ["active", "suspended"],
      artist_verification: ["unverified", "pending", "verified", "rejected"],
      audio_upload_status: ["pending", "uploaded", "processing", "accepted", "rejected", "failed"],
      credit_role: [
        "producer",
        "songwriter",
        "composer",
        "lyricist",
        "performer",
        "mixing_engineer",
        "mastering_engineer",
        "other",
      ],
      entitlement_source: ["promo", "beta", "admin", "referral", "subscription"],
      event_status: ["pending", "published", "rejected", "cancelled"],
      image_kind: ["release_artwork", "artist_image"],
      playlist_visibility: ["public", "unlisted", "private"],
      promo_benefit: [
        "premium_days",
        "premium_months",
        "premium_lifetime",
        "feature_access",
        "percent_discount",
        "fixed_discount",
      ],
      quality_tier: ["data_saver", "high", "lossless", "hires"],
      release_artist_role: ["primary", "featured"],
      release_review_kind: ["submitted", "withdrawn", "approved", "returned"],
      release_status: [
        "draft",
        "processing",
        "in_review",
        "approved",
        "published",
        "rejected",
        "taken_down",
      ],
      release_type: ["single", "ep", "album", "compilation", "live"],
      report_reason: ["copyright", "illegal", "hate", "impersonation", "spam", "other"],
      report_subject: ["artist", "release", "playlist", "event", "venue", "profile"],
      track_artist_role: ["main", "featured", "remixer"],
      visibility_level: ["public", "followers", "private"],
      voivodeship: [
        "dolnoslaskie",
        "kujawsko_pomorskie",
        "lubelskie",
        "lubuskie",
        "lodzkie",
        "malopolskie",
        "mazowieckie",
        "opolskie",
        "podkarpackie",
        "podlaskie",
        "pomorskie",
        "slaskie",
        "swietokrzyskie",
        "warminsko_mazurskie",
        "wielkopolskie",
        "zachodniopomorskie",
      ],
    },
  },
} as const;
