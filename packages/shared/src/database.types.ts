export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
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
        };
        Insert: {
          bio?: string | null;
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
        };
        Update: {
          bio?: string | null;
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
      rights_declarations: {
        Row: {
          ai_content: Database["public"]["Enums"]["ai_content"];
          cmo_memberships: string[];
          controls_composition: boolean;
          declared_at: string;
          declared_by: string;
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
          declared_by?: string;
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
          declared_by?: string;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      abandon_audio_upload: { Args: { reason?: string; upload: string }; Returns: undefined };
      abandon_image_upload: { Args: { image: string }; Returns: undefined };
      accept_artist_membership: { Args: { artist: string }; Returns: undefined };
      access_invite_is_valid: { Args: { code: string }; Returns: boolean };
      add_track: { Args: { release: string; title: string }; Returns: string };
      admin_grant_role: {
        Args: { role: Database["public"]["Enums"]["app_role"]; target_user: string };
        Returns: undefined;
      };
      admin_revoke_role: {
        Args: { role: Database["public"]["Enums"]["app_role"]; target_user: string };
        Returns: undefined;
      };
      admin_set_feature_flag: { Args: { enabled: boolean; flag: string }; Returns: undefined };
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
      can_view_image: { Args: { image: string }; Returns: boolean };
      can_view_release: { Args: { release: string }; Returns: boolean };
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
      delete_track: { Args: { track: string }; Returns: undefined };
      fail_audio_upload: {
        Args: { upload: string };
        Returns: Database["public"]["Enums"]["audio_upload_status"];
      };
      fail_image_upload: {
        Args: { image: string };
        Returns: Database["public"]["Enums"]["audio_upload_status"];
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
      move_track: { Args: { direction: number; track: string }; Returns: undefined };
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
      remove_artist_member: { Args: { artist: string; member: string }; Returns: undefined };
      request_artist_verification: {
        Args: { artist: string; evidence: Json; note?: string };
        Returns: string;
      };
      require_staff: {
        Args: { required: Database["public"]["Enums"]["app_role"] };
        Returns: undefined;
      };
      review_release: {
        Args: { decision: string; note?: string; release: string };
        Returns: Database["public"]["Enums"]["release_status"];
      };
      set_release_genres: { Args: { genre_ids: number[]; release: string }; Returns: undefined };
      submit_release: { Args: { release: string }; Returns: undefined };
      system_grant_role: {
        Args: { role: Database["public"]["Enums"]["app_role"]; target_email: string };
        Returns: string;
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
      image_kind: "release_artwork" | "artist_image";
      quality_tier: "data_saver" | "high" | "lossless" | "hires";
      release_artist_role: "primary" | "featured";
      release_review_kind: "submitted" | "withdrawn" | "approved" | "returned";
      release_status:
        "draft" | "processing" | "in_review" | "approved" | "published" | "rejected" | "taken_down";
      release_type: "single" | "ep" | "album" | "compilation" | "live";
      track_artist_role: "main" | "featured" | "remixer";
      visibility_level: "public" | "followers" | "private";
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
      image_kind: ["release_artwork", "artist_image"],
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
      track_artist_role: ["main", "featured", "remixer"],
      visibility_level: ["public", "followers", "private"],
    },
  },
} as const;
