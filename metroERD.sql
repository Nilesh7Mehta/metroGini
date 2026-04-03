--
-- PostgreSQL database dump
--

\restrict AveYRndOzEzRef1bCN1JdbSCLIKvwfCfutyHgK760K2ovQELsEgYTgJG8UOntoM

-- Dumped from database version 18.2
-- Dumped by pg_dump version 18.2

-- Started on 2026-04-03 17:27:19

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 947 (class 1247 OID 25015)
-- Name: helpline_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.helpline_role AS ENUM (
    'user',
    'rider',
    'both',
    'vendor'
);


ALTER TYPE public.helpline_role OWNER TO postgres;

--
-- TOC entry 914 (class 1247 OID 24732)
-- Name: order_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.order_status_enum AS ENUM (
    'draft',
    'created',
    'confirmed',
    'picked_up',
    'processing',
    'out_for_delivery',
    'delivered',
    'completed',
    'cancelled'
);


ALTER TYPE public.order_status_enum OWNER TO postgres;

--
-- TOC entry 917 (class 1247 OID 24754)
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'user',
    'admin'
);


ALTER TYPE public.user_role OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 254 (class 1259 OID 25054)
-- Name: banners; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.banners (
    id integer NOT NULL,
    image_url text NOT NULL,
    heading character varying(255),
    subheading character varying(255),
    description text,
    status boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.banners OWNER TO postgres;

--
-- TOC entry 253 (class 1259 OID 25053)
-- Name: banners_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.banners_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.banners_id_seq OWNER TO postgres;

--
-- TOC entry 5228 (class 0 OID 0)
-- Dependencies: 253
-- Name: banners_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.banners_id_seq OWNED BY public.banners.id;


--
-- TOC entry 230 (class 1259 OID 24607)
-- Name: cities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cities (
    id integer NOT NULL,
    city_name character varying(100) NOT NULL,
    image text,
    is_available boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.cities OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 24606)
-- Name: cities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.cities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cities_id_seq OWNER TO postgres;

--
-- TOC entry 5229 (class 0 OID 0)
-- Dependencies: 229
-- Name: cities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.cities_id_seq OWNED BY public.cities.id;


--
-- TOC entry 236 (class 1259 OID 24786)
-- Name: coupon_usages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coupon_usages (
    id integer NOT NULL,
    coupon_id integer NOT NULL,
    user_id integer NOT NULL,
    order_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_used boolean DEFAULT false,
    expiry_date timestamp without time zone
);


ALTER TABLE public.coupon_usages OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 24785)
-- Name: coupon_usages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.coupon_usages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.coupon_usages_id_seq OWNER TO postgres;

--
-- TOC entry 5230 (class 0 OID 0)
-- Dependencies: 235
-- Name: coupon_usages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.coupon_usages_id_seq OWNED BY public.coupon_usages.id;


--
-- TOC entry 234 (class 1259 OID 24761)
-- Name: coupons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coupons (
    id integer NOT NULL,
    coupon_code character varying(50) NOT NULL,
    discount_type character varying(20) NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    minimum_amount_value numeric(10,2) DEFAULT 0,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    per_user_limit integer DEFAULT 1,
    usage_limit integer,
    used_count integer DEFAULT 0,
    CONSTRAINT coupons_discount_type_check CHECK (((discount_type)::text = ANY ((ARRAY['percentage'::character varying, 'flat'::character varying])::text[])))
);


ALTER TABLE public.coupons OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 24760)
-- Name: coupons_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.coupons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.coupons_id_seq OWNER TO postgres;

--
-- TOC entry 5231 (class 0 OID 0)
-- Dependencies: 233
-- Name: coupons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.coupons_id_seq OWNED BY public.coupons.id;


--
-- TOC entry 242 (class 1259 OID 24893)
-- Name: helpline; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.helpline (
    id integer NOT NULL,
    user_id integer NOT NULL,
    message text NOT NULL,
    status character varying(20) DEFAULT 'open'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.helpline OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 24892)
-- Name: helpline_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.helpline_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.helpline_id_seq OWNER TO postgres;

--
-- TOC entry 5232 (class 0 OID 0)
-- Dependencies: 241
-- Name: helpline_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.helpline_id_seq OWNED BY public.helpline.id;


--
-- TOC entry 246 (class 1259 OID 24953)
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    title character varying(150) NOT NULL,
    message text NOT NULL,
    reference_type character varying(50),
    reference_id integer,
    is_read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    identity_id bigint NOT NULL,
    role character varying(20) NOT NULL
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- TOC entry 245 (class 1259 OID 24952)
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notifications_id_seq OWNER TO postgres;

--
-- TOC entry 5233 (class 0 OID 0)
-- Dependencies: 245
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- TOC entry 240 (class 1259 OID 24837)
-- Name: order_cancellations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_cancellations (
    id integer NOT NULL,
    order_id integer NOT NULL,
    user_id integer NOT NULL,
    reason_type character varying(50) NOT NULL,
    reason_description text,
    cancelled_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.order_cancellations OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 24836)
-- Name: order_cancellations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_cancellations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_cancellations_id_seq OWNER TO postgres;

--
-- TOC entry 5234 (class 0 OID 0)
-- Dependencies: 239
-- Name: order_cancellations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_cancellations_id_seq OWNED BY public.order_cancellations.id;


--
-- TOC entry 260 (class 1259 OID 41470)
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer NOT NULL,
    category character varying(50) NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- TOC entry 259 (class 1259 OID 41469)
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_items_id_seq OWNER TO postgres;

--
-- TOC entry 5235 (class 0 OID 0)
-- Dependencies: 259
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- TOC entry 244 (class 1259 OID 24914)
-- Name: order_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_reports (
    id integer NOT NULL,
    order_id integer NOT NULL,
    user_id integer NOT NULL,
    issue_type character varying(20) NOT NULL,
    issue_reason character varying(100) NOT NULL,
    description text,
    status character varying(20) DEFAULT 'open'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.order_reports OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 24913)
-- Name: order_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_reports_id_seq OWNER TO postgres;

--
-- TOC entry 5236 (class 0 OID 0)
-- Dependencies: 243
-- Name: order_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_reports_id_seq OWNED BY public.order_reports.id;


--
-- TOC entry 256 (class 1259 OID 33259)
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    user_id integer,
    service_id integer,
    service_type_id integer,
    clothes_count integer,
    estimated_weight_min numeric(10,2),
    estimated_weight_max numeric(10,2),
    actual_weight numeric(10,2),
    base_price_per_kg numeric(10,2),
    extra_price_per_kg numeric(10,2),
    flat_fee numeric(10,2),
    peak_extra_charge numeric(10,2),
    estimated_total numeric(10,2),
    final_total numeric(10,2),
    pickup_date date,
    pickup_slot_id integer,
    delivery_date date,
    delivery_slot_id integer,
    address_id integer,
    vendor_id integer,
    status character varying(30),
    payment_status character varying(30),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    applied_coupon_id integer,
    pickup_otp integer,
    otp_generated_at timestamp without time zone,
    otp_verified boolean DEFAULT false,
    assigned_rider_id integer,
    vendor_received_at date,
    delivered_at date,
    actual_clothes_count integer DEFAULT 0,
    delivery_otp integer
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- TOC entry 255 (class 1259 OID 33258)
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO postgres;

--
-- TOC entry 5237 (class 0 OID 0)
-- Dependencies: 255
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- TOC entry 238 (class 1259 OID 24820)
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    order_id integer,
    amount numeric(10,2) NOT NULL,
    payment_type character varying(20) NOT NULL,
    payment_method character varying(50),
    transaction_id character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 24819)
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payments_id_seq OWNER TO postgres;

--
-- TOC entry 5238 (class 0 OID 0)
-- Dependencies: 237
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- TOC entry 224 (class 1259 OID 16478)
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refresh_tokens (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.refresh_tokens OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16477)
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.refresh_tokens_id_seq OWNER TO postgres;

--
-- TOC entry 5239 (class 0 OID 0)
-- Dependencies: 223
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;


--
-- TOC entry 252 (class 1259 OID 25039)
-- Name: rider_helpline; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rider_helpline (
    id integer NOT NULL,
    rider_id integer NOT NULL,
    report_issue character varying(255) NOT NULL,
    message text NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.rider_helpline OWNER TO postgres;

--
-- TOC entry 251 (class 1259 OID 25038)
-- Name: rider_helpline_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.rider_helpline_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.rider_helpline_id_seq OWNER TO postgres;

--
-- TOC entry 5240 (class 0 OID 0)
-- Dependencies: 251
-- Name: rider_helpline_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.rider_helpline_id_seq OWNED BY public.rider_helpline.id;


--
-- TOC entry 248 (class 1259 OID 24976)
-- Name: riders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.riders (
    id integer NOT NULL,
    full_name character varying(100),
    mobile_number character varying(15),
    alternate_contact_number character varying(15),
    aadhaar_number character varying(20),
    pan_card_number character varying(20),
    date_of_birth date,
    residential_address text,
    vehicle_type character varying(50),
    vehicle_registration_number character varying(50),
    licence_validity_date date,
    account_holder_name character varying(100),
    bank_name character varying(100),
    account_number character varying(50),
    ifsc_code character varying(20),
    status character varying(20) DEFAULT 'pending'::character varying,
    is_terms_and_condition_verified boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    otp character varying(4),
    otp_expires_at timestamp without time zone,
    otp_attempts integer DEFAULT 0,
    profile_completed boolean DEFAULT false,
    shift_id integer,
    shift_started_at timestamp without time zone,
    is_active boolean DEFAULT false,
    image text,
    CONSTRAINT riders_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'inactive'::character varying, 'blocked'::character varying])::text[])))
);


ALTER TABLE public.riders OWNER TO postgres;

--
-- TOC entry 247 (class 1259 OID 24975)
-- Name: riders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.riders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.riders_id_seq OWNER TO postgres;

--
-- TOC entry 5241 (class 0 OID 0)
-- Dependencies: 247
-- Name: riders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.riders_id_seq OWNED BY public.riders.id;


--
-- TOC entry 228 (class 1259 OID 24589)
-- Name: service_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.service_types (
    id integer NOT NULL,
    service_id integer,
    name character varying(50) NOT NULL,
    extra_price_per_kg numeric(10,2) DEFAULT 0,
    flat_fee numeric(10,2) DEFAULT 0,
    delivery_hours integer,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.service_types OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 24588)
-- Name: service_types_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.service_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.service_types_id_seq OWNER TO postgres;

--
-- TOC entry 5242 (class 0 OID 0)
-- Dependencies: 227
-- Name: service_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.service_types_id_seq OWNED BY public.service_types.id;


--
-- TOC entry 226 (class 1259 OID 24577)
-- Name: services; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.services (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    base_price_per_kg numeric(10,2) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    image text,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.services OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 24576)
-- Name: services_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.services_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.services_id_seq OWNER TO postgres;

--
-- TOC entry 5243 (class 0 OID 0)
-- Dependencies: 225
-- Name: services_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.services_id_seq OWNED BY public.services.id;


--
-- TOC entry 250 (class 1259 OID 25003)
-- Name: shifts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shifts (
    id integer NOT NULL,
    shift_name character varying(50) NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    status boolean DEFAULT true
);


ALTER TABLE public.shifts OWNER TO postgres;

--
-- TOC entry 249 (class 1259 OID 25002)
-- Name: shifts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.shifts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.shifts_id_seq OWNER TO postgres;

--
-- TOC entry 5244 (class 0 OID 0)
-- Dependencies: 249
-- Name: shifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.shifts_id_seq OWNED BY public.shifts.id;


--
-- TOC entry 232 (class 1259 OID 24626)
-- Name: time_slots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.time_slots (
    id integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_peak boolean DEFAULT false,
    peak_extra_charge numeric(10,2) DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.time_slots OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 24625)
-- Name: time_slots_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.time_slots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.time_slots_id_seq OWNER TO postgres;

--
-- TOC entry 5245 (class 0 OID 0)
-- Dependencies: 231
-- Name: time_slots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.time_slots_id_seq OWNED BY public.time_slots.id;


--
-- TOC entry 222 (class 1259 OID 16447)
-- Name: user_address_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_address_details (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    address_type character varying(20) NOT NULL,
    complete_address text NOT NULL,
    floor character varying(100),
    landmark character varying(255),
    receiver_name character varying(100) NOT NULL,
    contact_number character varying(15) NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    is_selected boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    pincode character varying(10),
    CONSTRAINT user_address_details_address_type_check CHECK (((address_type)::text = ANY ((ARRAY['home'::character varying, 'work'::character varying, 'institute'::character varying])::text[])))
);


ALTER TABLE public.user_address_details OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16446)
-- Name: user_address_details_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_address_details_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_address_details_id_seq OWNER TO postgres;

--
-- TOC entry 5246 (class 0 OID 0)
-- Dependencies: 221
-- Name: user_address_details_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_address_details_id_seq OWNED BY public.user_address_details.id;


--
-- TOC entry 220 (class 1259 OID 16418)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    mobile character varying(15) NOT NULL,
    full_name character varying(100),
    email character varying(150),
    otp character varying(4),
    otp_expires_at timestamp without time zone,
    otp_attempts integer DEFAULT 0,
    is_mobile_verified boolean DEFAULT false,
    profile_completed boolean DEFAULT false,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    gender character varying(20),
    alternate_phone character varying(15),
    profile_image character varying(255),
    terms_and_condition boolean DEFAULT false,
    role public.user_role DEFAULT 'user'::public.user_role,
    user_password character varying(255),
    push_notification boolean DEFAULT true,
    CONSTRAINT gender_check CHECK (((gender)::text = ANY ((ARRAY['male'::character varying, 'female'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT users_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'blocked'::character varying])::text[])))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 16417)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- TOC entry 5247 (class 0 OID 0)
-- Dependencies: 219
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- TOC entry 258 (class 1259 OID 33270)
-- Name: vendors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vendors (
    id bigint NOT NULL,
    owner_contact_name character varying(255),
    mobile_number character varying(20),
    email character varying(255),
    aadhar_number character varying(20),
    pan_card_number character varying(20),
    laundry_shop_name character varying(255),
    shop_address text,
    gst_number character varying(50),
    account_holder_name character varying(255),
    bank_name character varying(255),
    account_number character varying(50),
    ifsc_code character varying(20),
    image text,
    otp character varying(10),
    otp_expire timestamp without time zone,
    status character varying(50) DEFAULT 'pending'::character varying,
    is_active boolean DEFAULT true,
    is_terms_and_condition boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    pincode text
);


ALTER TABLE public.vendors OWNER TO postgres;

--
-- TOC entry 257 (class 1259 OID 33269)
-- Name: vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vendors_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendors_id_seq OWNER TO postgres;

--
-- TOC entry 5248 (class 0 OID 0)
-- Dependencies: 257
-- Name: vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vendors_id_seq OWNED BY public.vendors.id;


--
-- TOC entry 4939 (class 2604 OID 25057)
-- Name: banners id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.banners ALTER COLUMN id SET DEFAULT nextval('public.banners_id_seq'::regclass);


--
-- TOC entry 4890 (class 2604 OID 24610)
-- Name: cities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cities ALTER COLUMN id SET DEFAULT nextval('public.cities_id_seq'::regclass);


--
-- TOC entry 4907 (class 2604 OID 24789)
-- Name: coupon_usages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coupon_usages ALTER COLUMN id SET DEFAULT nextval('public.coupon_usages_id_seq'::regclass);


--
-- TOC entry 4900 (class 2604 OID 24764)
-- Name: coupons id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coupons ALTER COLUMN id SET DEFAULT nextval('public.coupons_id_seq'::regclass);


--
-- TOC entry 4915 (class 2604 OID 24896)
-- Name: helpline id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpline ALTER COLUMN id SET DEFAULT nextval('public.helpline_id_seq'::regclass);


--
-- TOC entry 4923 (class 2604 OID 24956)
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- TOC entry 4913 (class 2604 OID 24840)
-- Name: order_cancellations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_cancellations ALTER COLUMN id SET DEFAULT nextval('public.order_cancellations_id_seq'::regclass);


--
-- TOC entry 4953 (class 2604 OID 41473)
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- TOC entry 4919 (class 2604 OID 24917)
-- Name: order_reports id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_reports ALTER COLUMN id SET DEFAULT nextval('public.order_reports_id_seq'::regclass);


--
-- TOC entry 4942 (class 2604 OID 33262)
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- TOC entry 4910 (class 2604 OID 24823)
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- TOC entry 4879 (class 2604 OID 16481)
-- Name: refresh_tokens id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);


--
-- TOC entry 4936 (class 2604 OID 25042)
-- Name: rider_helpline id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rider_helpline ALTER COLUMN id SET DEFAULT nextval('public.rider_helpline_id_seq'::regclass);


--
-- TOC entry 4926 (class 2604 OID 24979)
-- Name: riders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.riders ALTER COLUMN id SET DEFAULT nextval('public.riders_id_seq'::regclass);


--
-- TOC entry 4885 (class 2604 OID 24592)
-- Name: service_types id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_types ALTER COLUMN id SET DEFAULT nextval('public.service_types_id_seq'::regclass);


--
-- TOC entry 4881 (class 2604 OID 24580)
-- Name: services id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.services ALTER COLUMN id SET DEFAULT nextval('public.services_id_seq'::regclass);


--
-- TOC entry 4934 (class 2604 OID 25006)
-- Name: shifts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts ALTER COLUMN id SET DEFAULT nextval('public.shifts_id_seq'::regclass);


--
-- TOC entry 4894 (class 2604 OID 24629)
-- Name: time_slots id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.time_slots ALTER COLUMN id SET DEFAULT nextval('public.time_slots_id_seq'::regclass);


--
-- TOC entry 4874 (class 2604 OID 16450)
-- Name: user_address_details id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_address_details ALTER COLUMN id SET DEFAULT nextval('public.user_address_details_id_seq'::regclass);


--
-- TOC entry 4864 (class 2604 OID 16421)
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- TOC entry 4947 (class 2604 OID 33273)
-- Name: vendors id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendors ALTER COLUMN id SET DEFAULT nextval('public.vendors_id_seq'::regclass);


--
-- TOC entry 5216 (class 0 OID 25054)
-- Dependencies: 254
-- Data for Name: banners; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.banners (id, image_url, heading, subheading, description, status, created_at) FROM stdin;
1	uploads\\banners\\1773212242942.jpg	 Festival Offer 1st	 Earn more today	 Get bonus for deliveries	t	2026-03-11 12:27:23.079273
\.


--
-- TOC entry 5192 (class 0 OID 24607)
-- Dependencies: 230
-- Data for Name: cities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cities (id, city_name, image, is_available, created_at, updated_at) FROM stdin;
1	Thane	uploads/cities/thane.png	t	2026-02-19 12:24:39.391231	2026-02-19 12:24:39.391231
\.


--
-- TOC entry 5198 (class 0 OID 24786)
-- Dependencies: 236
-- Data for Name: coupon_usages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.coupon_usages (id, coupon_id, user_id, order_id, created_at, is_used, expiry_date) FROM stdin;
5	5	1	\N	2026-02-27 12:25:52.724549	f	2026-03-29 12:25:52.724549
\.


--
-- TOC entry 5196 (class 0 OID 24761)
-- Dependencies: 234
-- Data for Name: coupons; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.coupons (id, coupon_code, discount_type, discount_value, minimum_amount_value, start_date, end_date, is_active, created_at, updated_at, per_user_limit, usage_limit, used_count) FROM stdin;
5	CANCEL500	flat	500.00	0.00	2026-02-26 19:12:22.97886	2031-02-26 19:12:22.97886	t	2026-02-26 19:12:22.97886	2026-02-26 19:12:22.97886	1	\N	0
4	FLAT100	flat	100.00	500.00	2026-02-20 00:00:00	2026-03-20 23:59:59	t	2026-02-23 12:10:14.198005	2026-02-23 12:10:48.931259	5	\N	0
\.


--
-- TOC entry 5204 (class 0 OID 24893)
-- Dependencies: 242
-- Data for Name: helpline; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.helpline (id, user_id, message, status, created_at, updated_at) FROM stdin;
1	1	I was facing issue in PAYMEnt	open	2026-03-02 13:46:47.017834	2026-03-02 13:46:47.017834
\.


--
-- TOC entry 5208 (class 0 OID 24953)
-- Dependencies: 246
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, title, message, reference_type, reference_id, is_read, created_at, identity_id, role) FROM stdin;
\.


--
-- TOC entry 5202 (class 0 OID 24837)
-- Dependencies: 240
-- Data for Name: order_cancellations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_cancellations (id, order_id, user_id, reason_type, reason_description, cancelled_at) FROM stdin;
6	5	1	changed_mind	\N	2026-02-27 12:25:52.724549
\.


--
-- TOC entry 5222 (class 0 OID 41470)
-- Dependencies: 260
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_items (id, order_id, category, quantity, created_at) FROM stdin;
5	1	tops	8	2026-03-24 15:20:19.955181
6	1	bottoms	8	2026-03-24 15:20:19.955181
\.


--
-- TOC entry 5206 (class 0 OID 24914)
-- Dependencies: 244
-- Data for Name: order_reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_reports (id, order_id, user_id, issue_type, issue_reason, description, status, created_at, updated_at) FROM stdin;
1	5	1	rider_issue	Could not reach rider	Rider was not responding to calls	open	2026-03-02 15:10:12.181402	2026-03-02 15:10:12.181402
\.


--
-- TOC entry 5218 (class 0 OID 33259)
-- Dependencies: 256
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, user_id, service_id, service_type_id, clothes_count, estimated_weight_min, estimated_weight_max, actual_weight, base_price_per_kg, extra_price_per_kg, flat_fee, peak_extra_charge, estimated_total, final_total, pickup_date, pickup_slot_id, delivery_date, delivery_slot_id, address_id, vendor_id, status, payment_status, created_at, updated_at, applied_coupon_id, pickup_otp, otp_generated_at, otp_verified, assigned_rider_id, vendor_received_at, delivered_at, actual_clothes_count, delivery_otp) FROM stdin;
2	1	1	2	10	4.00	7.00	\N	200.00	0.00	100.00	0.00	1200.00	\N	2026-03-20	2	2026-03-24	2	3	1	in_process	partially_paid	2026-03-20 22:34:01.01975	2026-03-20 22:35:52.412859	\N	1531	2026-03-20 23:32:00.209246	t	2	2026-03-23	\N	0	\N
1	1	1	1	12	5.00	8.50	11.70	200.00	0.00	100.00	0.00	1450.00	2090.00	2026-03-18	2	2026-03-22	2	4	1	delivered	paid	2026-03-18 15:07:46.557171	2026-03-24 19:54:11.096119	4	1747	2026-03-18 19:30:00.181286	t	2	2026-03-23	\N	16	6884
\.


--
-- TOC entry 5200 (class 0 OID 24820)
-- Dependencies: 238
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payments (id, order_id, amount, payment_type, payment_method, transaction_id, status, paid_at, created_at) FROM stdin;
9	5	500.00	advance	UPI	\N	success	\N	2026-03-03 15:32:05.96285
10	1	500.00	advance	UPI	\N	success	\N	2026-03-18 15:18:14.427789
11	1	500.00	advance	UPI	\N	success	\N	2026-03-18 19:25:52.958044
12	1	1590.00	remaining	cash	\N	success	\N	2026-03-24 19:54:03.359966
\.


--
-- TOC entry 5186 (class 0 OID 16478)
-- Dependencies: 224
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.refresh_tokens (id, user_id, token, expires_at, created_at) FROM stdin;
10	1	9f218e7f3874d999cceb5a5548f0cb2a08640b9d135bc9cc05b12995674e2ad1f31e1ea3b10d7193	2026-02-26 13:44:45.152	2026-02-19 13:44:45.15471
11	1	fe08c7afe067bfe7b15db39def7532c9214ec90a7e1922bf2cd353d88bbffbaef704c3bb22579fe3	2026-02-26 14:04:34.437	2026-02-19 14:04:34.438766
12	1	2defdbe590d718d8d35686081fa53318f810ded8a19726eb16f481418e7da5b4b53d1197419bc8d8	2026-02-27 11:07:32.16	2026-02-20 11:07:32.158406
13	1	1ff025e82662e4859617980a7de3c2c7ed6d158e4c5d3acb35f98e4bdc1aad087f6406ae7c04fba6	2026-02-27 12:03:05.199	2026-02-20 12:03:05.200532
14	1	f9ed636cbbbabb196fffbc9a054beb1f5bd8bc4acf8a8db4fab011002a7da53bf83eab8335c1ecbf	2026-03-02 15:12:18.164	2026-02-23 15:12:18.165263
15	1	1d5c799d4d01a699ba0d064c927f3ea6abe55070b749ed74ded5647764702a40437e6f5b3da590b4	2026-03-09 13:44:46.636	2026-03-02 13:44:46.636987
16	1	31e20a53e581641be53e073819d8562210df7d04e1992c8923d51a2b17a7fa8b978d33fc96b3205f	2026-03-10 15:20:47.443	2026-03-03 15:20:47.444235
17	1	9a796c71bb59982737f418f1c6d059741d1273248d0c751ad3bb26a7e67cb124e9f5b366cc93457a	2026-03-17 15:36:00.846	2026-03-10 15:36:00.847085
18	1	1d8c94e2ca93c52d50290a79a1058763f372fbb62451b76f2711efb63294c67947adb970ea389e7a	2026-03-24 11:49:30.591	2026-03-17 11:49:30.592639
19	1	ced7df6059cf38c7e621690e0281ea8bea0ce3f10f59d188d01fc52a7015d03b96d3c5c9753060e7	2026-03-25 15:05:34.181	2026-03-18 15:05:34.183439
20	1	f59875ac297694aa43f7fa30c0b6c43c1de5d722be266f2846361fb23c10b7385e43cadf030a3e81	2026-03-25 19:23:56.605	2026-03-18 19:23:56.607025
21	1	73c71b870f308f3e9f393a94e1f89b75be52c5c325bb681e1d59d57683919dc87322a23fc6e71809	2026-03-27 16:25:16.711	2026-03-20 16:25:16.71351
22	1	c58ac87fe9e8a2a9872894c4757f04f24c7f54aaab3771f0c98aa6cce2f447fe9acb583548151773	2026-03-28 14:36:21.33	2026-03-21 14:36:21.340308
23	1	3781b62f8116eb457196c7eee0f42ab9359fa7b5759ef807759c27f8428703209a241218d42579e0	2026-03-28 14:39:07.692	2026-03-21 14:39:07.702443
\.


--
-- TOC entry 5214 (class 0 OID 25039)
-- Dependencies: 252
-- Data for Name: rider_helpline; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.rider_helpline (id, rider_id, report_issue, message, status, created_at) FROM stdin;
1	2	Accident / Injury	I met with a small accident during delivery	pending	2026-03-11 11:42:05.196009
\.


--
-- TOC entry 5210 (class 0 OID 24976)
-- Dependencies: 248
-- Data for Name: riders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.riders (id, full_name, mobile_number, alternate_contact_number, aadhaar_number, pan_card_number, date_of_birth, residential_address, vehicle_type, vehicle_registration_number, licence_validity_date, account_holder_name, bank_name, account_number, ifsc_code, status, is_terms_and_condition_verified, created_at, updated_at, otp, otp_expires_at, otp_attempts, profile_completed, shift_id, shift_started_at, is_active, image) FROM stdin;
2	Rahul Sharma	6666666666	9876543210	123412341234	ABCDE1234F	1995-05-20	Mumbai Maharashtra	Bike	MH12AB1234	2030-12-31	Rahul Sharma	HDFC Bank	123456789012	HDFC0001234	active	t	2026-03-06 14:07:28.899035	2026-03-06 14:07:28.899035	1234	2026-03-21 11:11:02.842311	0	t	3	2026-03-09 17:01:33.46806	t	uploads\\riders\\1773136120733.png
\.


--
-- TOC entry 5190 (class 0 OID 24589)
-- Dependencies: 228
-- Data for Name: service_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.service_types (id, service_id, name, extra_price_per_kg, flat_fee, delivery_hours, is_active, created_at) FROM stdin;
1	1	Regular Service	0.00	100.00	72	t	2026-02-18 19:01:03.498636
2	1	Express Service	20.00	150.00	24	t	2026-02-18 19:01:03.498636
\.


--
-- TOC entry 5188 (class 0 OID 24577)
-- Dependencies: 226
-- Data for Name: services; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.services (id, name, base_price_per_kg, is_active, created_at, image, updated_at) FROM stdin;
1	Wash by Kilo	200.00	t	2026-02-18 18:57:35.029535	uploads/service_image/wash_by_kilo.png	2026-02-19 12:08:36.139392
2	Dry Cleaning	300.00	t	2026-02-18 18:57:35.029535	uploads/service_image/dry_cleaning.png	2026-02-19 12:08:45.598557
\.


--
-- TOC entry 5212 (class 0 OID 25003)
-- Dependencies: 250
-- Data for Name: shifts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.shifts (id, shift_name, start_time, end_time, status) FROM stdin;
1	Morning	07:30:00	13:00:00	t
2	Night	16:00:00	21:30:00	t
3	FullDay	07:00:00	22:00:00	t
\.


--
-- TOC entry 5194 (class 0 OID 24626)
-- Dependencies: 232
-- Data for Name: time_slots; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.time_slots (id, start_time, end_time, is_peak, peak_extra_charge, is_active, created_at, updated_at) FROM stdin;
1	07:00:00	11:00:00	f	0.00	t	2026-02-19 12:46:00.816885	2026-02-19 12:46:00.816885
2	11:00:00	14:00:00	t	0.00	t	2026-02-19 12:46:00.816885	2026-02-19 12:46:00.816885
3	14:00:00	17:00:00	f	0.00	t	2026-02-19 12:46:00.816885	2026-02-19 12:46:00.816885
4	17:00:00	20:00:00	t	0.00	t	2026-02-19 12:46:00.816885	2026-02-19 12:46:00.816885
\.


--
-- TOC entry 5184 (class 0 OID 16447)
-- Dependencies: 222
-- Data for Name: user_address_details; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_address_details (id, user_id, address_type, complete_address, floor, landmark, receiver_name, contact_number, latitude, longitude, is_selected, is_active, created_at, updated_at, pincode) FROM stdin;
4	1	work	2108/B , Padmavati Nagar	2108	Mumbai	Pinu	8876789098	19.27078	19.27078	f	t	2026-02-17 19:18:01.41673	2026-02-17 19:18:01.41673	400602
3	1	home	2108/B , Mahavir Nagar	208	Mumbai	Babli	8876789098	19.27078	19.27078	t	t	2026-02-17 18:08:51.467485	2026-02-17 18:08:51.467485	400602
\.


--
-- TOC entry 5182 (class 0 OID 16418)
-- Dependencies: 220
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, mobile, full_name, email, otp, otp_expires_at, otp_attempts, is_mobile_verified, profile_completed, status, created_at, updated_at, gender, alternate_phone, profile_image, terms_and_condition, role, user_password, push_notification) FROM stdin;
2	9876543210	Admin User	admin@gmail.com	\N	\N	0	f	f	active	2026-02-19 18:40:40.988454	2026-02-19 18:40:40.988454	\N	\N	\N	f	admin	$2b$10$BXWOoGo0qGq0Rt7fRb8j2u89WVmhdJFHovri12yrA2IAFhQuI8r7a	t
1	9004186460	Nileshkumar Prakash Mehta	mehtanilesh811@gmail.com	1234	2026-03-06 14:37:37.164418	0	t	t	active	2026-02-17 15:06:00.079017	2026-02-17 15:06:00.079017	male	8876567890	uploads/profile/1771336046378.png	t	user	\N	t
\.


--
-- TOC entry 5220 (class 0 OID 33270)
-- Dependencies: 258
-- Data for Name: vendors; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vendors (id, owner_contact_name, mobile_number, email, aadhar_number, pan_card_number, laundry_shop_name, shop_address, gst_number, account_holder_name, bank_name, account_number, ifsc_code, image, otp, otp_expire, status, is_active, is_terms_and_condition, created_at, updated_at, pincode) FROM stdin;
2	John Doe	9876543210	john@gmail.com	123412341234	ABCDE1234F	Quick Wash Laundry	23 Main Street, City	22ABCDE1234F1Z5	John Doe	HDFC Bank	123456789012	HDFC0001234	uploads\\vendors\\1774078105851.png	\N	\N	active	t	f	2026-03-21 12:58:25.976011	2026-03-21 12:58:25.976011	400602
1	Vendor One	7777777777	v1@gmail.com	123412341234	ABCDE1234F	Quick Wash Laundry	23 Main Street, City	22ABCDE1234F1Z5	John Doe	HDFC Bank	123456789012	HDFC0001234	uploads\\vendors\\1774076121903.png	1234	2026-03-27 15:57:25.007	active	t	t	2026-03-21 12:25:21.995301	2026-03-21 16:46:56.685969	400602
\.


--
-- TOC entry 5249 (class 0 OID 0)
-- Dependencies: 253
-- Name: banners_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.banners_id_seq', 1, true);


--
-- TOC entry 5250 (class 0 OID 0)
-- Dependencies: 229
-- Name: cities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cities_id_seq', 1, true);


--
-- TOC entry 5251 (class 0 OID 0)
-- Dependencies: 235
-- Name: coupon_usages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.coupon_usages_id_seq', 5, true);


--
-- TOC entry 5252 (class 0 OID 0)
-- Dependencies: 233
-- Name: coupons_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.coupons_id_seq', 5, true);


--
-- TOC entry 5253 (class 0 OID 0)
-- Dependencies: 241
-- Name: helpline_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.helpline_id_seq', 1, true);


--
-- TOC entry 5254 (class 0 OID 0)
-- Dependencies: 245
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notifications_id_seq', 7, true);


--
-- TOC entry 5255 (class 0 OID 0)
-- Dependencies: 239
-- Name: order_cancellations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_cancellations_id_seq', 6, true);


--
-- TOC entry 5256 (class 0 OID 0)
-- Dependencies: 259
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_items_id_seq', 6, true);


--
-- TOC entry 5257 (class 0 OID 0)
-- Dependencies: 243
-- Name: order_reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_reports_id_seq', 1, true);


--
-- TOC entry 5258 (class 0 OID 0)
-- Dependencies: 255
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.orders_id_seq', 2, true);


--
-- TOC entry 5259 (class 0 OID 0)
-- Dependencies: 237
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.payments_id_seq', 12, true);


--
-- TOC entry 5260 (class 0 OID 0)
-- Dependencies: 223
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.refresh_tokens_id_seq', 23, true);


--
-- TOC entry 5261 (class 0 OID 0)
-- Dependencies: 251
-- Name: rider_helpline_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.rider_helpline_id_seq', 1, true);


--
-- TOC entry 5262 (class 0 OID 0)
-- Dependencies: 247
-- Name: riders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.riders_id_seq', 2, true);


--
-- TOC entry 5263 (class 0 OID 0)
-- Dependencies: 227
-- Name: service_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.service_types_id_seq', 2, true);


--
-- TOC entry 5264 (class 0 OID 0)
-- Dependencies: 225
-- Name: services_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.services_id_seq', 2, true);


--
-- TOC entry 5265 (class 0 OID 0)
-- Dependencies: 249
-- Name: shifts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.shifts_id_seq', 1, true);


--
-- TOC entry 5266 (class 0 OID 0)
-- Dependencies: 231
-- Name: time_slots_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.time_slots_id_seq', 4, true);


--
-- TOC entry 5267 (class 0 OID 0)
-- Dependencies: 221
-- Name: user_address_details_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_address_details_id_seq', 4, true);


--
-- TOC entry 5268 (class 0 OID 0)
-- Dependencies: 219
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 2, true);


--
-- TOC entry 5269 (class 0 OID 0)
-- Dependencies: 257
-- Name: vendors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.vendors_id_seq', 4, true);


--
-- TOC entry 5015 (class 2606 OID 25065)
-- Name: banners banners_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.banners
    ADD CONSTRAINT banners_pkey PRIMARY KEY (id);


--
-- TOC entry 4976 (class 2606 OID 24621)
-- Name: cities cities_city_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_city_name_key UNIQUE (city_name);


--
-- TOC entry 4978 (class 2606 OID 24619)
-- Name: cities cities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_pkey PRIMARY KEY (id);


--
-- TOC entry 4986 (class 2606 OID 24796)
-- Name: coupon_usages coupon_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coupon_usages
    ADD CONSTRAINT coupon_usages_pkey PRIMARY KEY (id);


--
-- TOC entry 4982 (class 2606 OID 24779)
-- Name: coupons coupons_coupon_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_coupon_code_key UNIQUE (coupon_code);


--
-- TOC entry 4984 (class 2606 OID 24777)
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- TOC entry 4994 (class 2606 OID 24906)
-- Name: helpline helpline_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpline
    ADD CONSTRAINT helpline_pkey PRIMARY KEY (id);


--
-- TOC entry 5003 (class 2606 OID 24966)
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- TOC entry 4992 (class 2606 OID 24849)
-- Name: order_cancellations order_cancellations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_cancellations
    ADD CONSTRAINT order_cancellations_pkey PRIMARY KEY (id);


--
-- TOC entry 5025 (class 2606 OID 41481)
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- TOC entry 4999 (class 2606 OID 24929)
-- Name: order_reports order_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_reports
    ADD CONSTRAINT order_reports_pkey PRIMARY KEY (id);


--
-- TOC entry 5017 (class 2606 OID 33268)
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- TOC entry 4990 (class 2606 OID 24830)
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- TOC entry 4970 (class 2606 OID 16490)
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 5013 (class 2606 OID 25052)
-- Name: rider_helpline rider_helpline_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rider_helpline
    ADD CONSTRAINT rider_helpline_pkey PRIMARY KEY (id);


--
-- TOC entry 5005 (class 2606 OID 24991)
-- Name: riders riders_mobile_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.riders
    ADD CONSTRAINT riders_mobile_number_key UNIQUE (mobile_number);


--
-- TOC entry 5007 (class 2606 OID 24989)
-- Name: riders riders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.riders
    ADD CONSTRAINT riders_pkey PRIMARY KEY (id);


--
-- TOC entry 4974 (class 2606 OID 24600)
-- Name: service_types service_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_types
    ADD CONSTRAINT service_types_pkey PRIMARY KEY (id);


--
-- TOC entry 4972 (class 2606 OID 24587)
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- TOC entry 5011 (class 2606 OID 25012)
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- TOC entry 4980 (class 2606 OID 24639)
-- Name: time_slots time_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.time_slots
    ADD CONSTRAINT time_slots_pkey PRIMARY KEY (id);


--
-- TOC entry 4988 (class 2606 OID 24813)
-- Name: coupon_usages unique_coupon_user_order; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coupon_usages
    ADD CONSTRAINT unique_coupon_user_order UNIQUE (coupon_id, user_id, order_id);


--
-- TOC entry 5019 (class 2606 OID 33287)
-- Name: vendors unique_email; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT unique_email UNIQUE (email);


--
-- TOC entry 5009 (class 2606 OID 24993)
-- Name: riders unique_mobile_number; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.riders
    ADD CONSTRAINT unique_mobile_number UNIQUE (mobile_number);


--
-- TOC entry 4968 (class 2606 OID 16467)
-- Name: user_address_details user_address_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_address_details
    ADD CONSTRAINT user_address_details_pkey PRIMARY KEY (id);


--
-- TOC entry 4962 (class 2606 OID 16436)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 4964 (class 2606 OID 16434)
-- Name: users users_mobile_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_mobile_key UNIQUE (mobile);


--
-- TOC entry 4966 (class 2606 OID 16432)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 5021 (class 2606 OID 33285)
-- Name: vendors vendors_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_email_key UNIQUE (email);


--
-- TOC entry 5023 (class 2606 OID 33283)
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- TOC entry 5000 (class 1259 OID 24973)
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- TOC entry 5001 (class 1259 OID 24974)
-- Name: idx_notifications_reference; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_reference ON public.notifications USING btree (reference_type, reference_id);


--
-- TOC entry 4995 (class 1259 OID 24940)
-- Name: idx_order_reports_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_reports_order_id ON public.order_reports USING btree (order_id);


--
-- TOC entry 4996 (class 1259 OID 24942)
-- Name: idx_order_reports_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_reports_status ON public.order_reports USING btree (status);


--
-- TOC entry 4997 (class 1259 OID 24941)
-- Name: idx_order_reports_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_reports_user_id ON public.order_reports USING btree (user_id);


--
-- TOC entry 5029 (class 2606 OID 24797)
-- Name: coupon_usages coupon_usages_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coupon_usages
    ADD CONSTRAINT coupon_usages_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE CASCADE;


--
-- TOC entry 5030 (class 2606 OID 24802)
-- Name: coupon_usages coupon_usages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coupon_usages
    ADD CONSTRAINT coupon_usages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5033 (class 2606 OID 41482)
-- Name: order_items fk_order; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT fk_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- TOC entry 5027 (class 2606 OID 16491)
-- Name: refresh_tokens fk_refresh_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5026 (class 2606 OID 16468)
-- Name: user_address_details fk_user_address; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_address_details
    ADD CONSTRAINT fk_user_address FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5031 (class 2606 OID 24907)
-- Name: helpline helpline_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helpline
    ADD CONSTRAINT helpline_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5032 (class 2606 OID 24935)
-- Name: order_reports order_reports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_reports
    ADD CONSTRAINT order_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5028 (class 2606 OID 24601)
-- Name: service_types service_types_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_types
    ADD CONSTRAINT service_types_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


-- Completed on 2026-04-03 17:27:20

--
-- PostgreSQL database dump complete
--

\unrestrict AveYRndOzEzRef1bCN1JdbSCLIKvwfCfutyHgK760K2ovQELsEgYTgJG8UOntoM

